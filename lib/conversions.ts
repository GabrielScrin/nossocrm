import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ConversionEventType = 'lead' | 'mql' | 'opportunity' | 'sale';

export type BaseConversionPayload = {
  organizationId: string;
  projectId: string;
  leadId?: string | null;
  eventType: ConversionEventType;
  eventTime?: string; // ISO
  amount?: number;
  currency?: string;
  clickId?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type MetaConversionPayload = BaseConversionPayload & {
  platform: 'meta';
  pixelId?: string;
  accessToken?: string;
};

export type GoogleConversionPayload = BaseConversionPayload & {
  platform: 'google';
  customerId?: string;
  conversionActionId?: string;
  developerToken?: string;
  loginCustomerId?: string;
  accessToken?: string;
};

type ConversionResult = {
  status: 'sent' | 'skipped' | 'pending' | 'error';
  external_response?: any;
  reason?: string;
  payloadHash: string;
};

function toHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function mapMetaEventName(eventType: ConversionEventType): string {
  switch (eventType) {
    case 'sale':
      return 'Purchase';
    case 'opportunity':
      return 'AddPaymentInfo';
    case 'mql':
      return 'CompleteRegistration';
    case 'lead':
    default:
      return 'Lead';
  }
}

async function recordConversionEvent(
  admin: SupabaseClient,
  payload: BaseConversionPayload & { platform: 'meta' | 'google' },
  result: ConversionResult
) {
  await admin
    .from('conversion_events')
    .upsert({
      organization_id: payload.organizationId,
      project_id: payload.projectId,
      lead_id: payload.leadId ?? null,
      event_type: payload.eventType,
      platform: payload.platform,
      payload_hash: result.payloadHash,
      status: result.status,
      external_response: result.external_response ?? null,
      attempted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
}

async function recordFunnelEvent(admin: SupabaseClient, payload: BaseConversionPayload & { platform: 'meta' | 'google' }) {
  const occurredAt = payload.eventTime || new Date().toISOString();
  await admin
    .from('funnel_events')
    .insert({
      organization_id: payload.organizationId,
      project_id: payload.projectId,
      lead_id: payload.leadId ?? null,
      event_type: payload.eventType,
      platform: payload.platform,
      click_id: payload.clickId || null,
      gclid: payload.gclid || null,
      fbclid: payload.fbclid || null,
      amount: payload.amount ?? null,
      currency: payload.currency ?? null,
      occurred_at: occurredAt,
    });
}

async function sendToMeta(payload: MetaConversionPayload, payloadHash: string): Promise<ConversionResult> {
  if (!payload.pixelId || !payload.accessToken) {
    return { status: 'skipped', reason: 'missing_meta_credentials', payloadHash };
  }

  const eventTimeSeconds = payload.eventTime ? Math.floor(Date.parse(payload.eventTime) / 1000) : Math.floor(Date.now() / 1000);
  const body = {
    data: [
      {
        event_name: mapMetaEventName(payload.eventType),
        event_time: eventTimeSeconds,
        event_id: payloadHash,
        action_source: 'website',
        user_data: {
          em: payload.email ? [payload.email] : undefined,
          ph: payload.phone ? [payload.phone] : undefined,
          fbc: payload.fbclid || undefined,
          fbp: payload.clickId || undefined,
        },
        custom_data: {
          currency: payload.currency || 'BRL',
          value: payload.amount ?? 0,
        },
      },
    ],
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${payload.pixelId}/events?access_token=${payload.accessToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { status: 'error', external_response: json, payloadHash, reason: 'meta_http_' + res.status };
    }
    return { status: 'sent', external_response: json, payloadHash };
  } catch (err: any) {
    return { status: 'error', external_response: { message: err?.message || String(err) }, payloadHash };
  }
}

async function sendToGoogle(payload: GoogleConversionPayload, payloadHash: string): Promise<ConversionResult> {
  if (!payload.customerId || !payload.conversionActionId || !payload.developerToken || !payload.accessToken) {
    return { status: 'skipped', reason: 'missing_google_credentials', payloadHash };
  }

  const gclid = payload.gclid || payload.clickId;
  if (!gclid) {
    return { status: 'skipped', reason: 'missing_gclid', payloadHash };
  }

  const conversionDateTime = payload.eventTime || new Date().toISOString();
  const conversionActionResource = `customers/${payload.customerId}/conversionActions/${payload.conversionActionId}`;

  const body = {
    partialFailure: true,
    validateOnly: false,
    conversions: [
      {
        gclid,
        conversionAction: conversionActionResource,
        conversionDateTime,
        conversionValue: payload.amount ?? 0,
        currencyCode: payload.currency || 'BRL',
        orderId: payloadHash,
      },
    ],
  };

  try {
    const res = await fetch(`https://googleads.googleapis.com/v15/customers/${payload.customerId}:uploadClickConversions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${payload.accessToken}`,
        'developer-token': payload.developerToken,
        ...(payload.loginCustomerId ? { 'login-customer-id': payload.loginCustomerId } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return { status: 'error', external_response: json, payloadHash, reason: 'google_http_' + res.status };
    }

    const partialFailure = json?.partialFailureError;
    if (partialFailure) {
      return { status: 'error', external_response: json, payloadHash, reason: 'google_partial_failure' };
    }

    return { status: 'sent', external_response: json, payloadHash };
  } catch (err: any) {
    return { status: 'error', external_response: { message: err?.message || String(err) }, payloadHash };
  }
}

export async function handleMetaConversion(admin: SupabaseClient, payload: MetaConversionPayload) {
  const payloadHash = toHash({
    organizationId: payload.organizationId,
    projectId: payload.projectId,
    leadId: payload.leadId,
    eventType: payload.eventType,
    eventTime: payload.eventTime,
    clickId: payload.clickId,
    fbclid: payload.fbclid,
    amount: payload.amount,
    currency: payload.currency,
  });

  await recordFunnelEvent(admin, payload);
  const result = await sendToMeta(payload, payloadHash);
  await recordConversionEvent(admin, payload, result);
  return result;
}

export async function handleGoogleConversion(admin: SupabaseClient, payload: GoogleConversionPayload) {
  const payloadHash = toHash({
    organizationId: payload.organizationId,
    projectId: payload.projectId,
    leadId: payload.leadId,
    eventType: payload.eventType,
    eventTime: payload.eventTime,
    gclid: payload.gclid,
    amount: payload.amount,
    currency: payload.currency,
  });

  await recordFunnelEvent(admin, payload);
  const result = await sendToGoogle(payload, payloadHash);
  await recordConversionEvent(admin, payload, result);
  return result;
}
