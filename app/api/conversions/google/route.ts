import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { handleGoogleConversion } from '@/lib/conversions';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const GoogleSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  eventType: z.enum(['lead', 'mql', 'opportunity', 'sale']),
  eventTime: z.string().datetime().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  gclid: z.string().optional(),
  clickId: z.string().optional(),
  customerId: z.string().optional(),
  conversionActionId: z.string().optional(),
  developerToken: z.string().optional(),
  loginCustomerId: z.string().optional(),
  accessToken: z.string().optional(),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = GoogleSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);

  const admin = await createAdminClient();
  try {
    const result = await handleGoogleConversion(admin, { platform: 'google', ...parsed.data });
    return json({ ok: true, status: result.status, reason: result.reason, response: result.external_response });
  } catch (err: any) {
    console.error('[conversions/google] failed:', err);
    return json({ error: err?.message || 'Conversion failed' }, 500);
  }
}
