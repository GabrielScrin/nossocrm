import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { ingestAdsPayload } from '@/lib/ads/ingest';

function json<T>(body: T, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

const AccountSchema = z.object({
    external_id: z.string().min(1),
    name: z.string().optional(),
    status: z.string().optional(),
    currency: z.string().optional(),
    timezone: z.string().optional(),
});

const CampaignSchema = z.object({
    external_id: z.string().min(1),
    account_external_id: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    objective: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    budget: z.number().optional(),
    budget_type: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

const AdSetSchema = z.object({
    external_id: z.string().min(1),
    account_external_id: z.string().optional(),
    campaign_external_id: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    optimization_goal: z.string().optional(),
    bid_strategy: z.string().optional(),
    daily_budget: z.number().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    targeting: z.record(z.string(), z.any()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

const CreativeSchema = z.object({
    external_id: z.string().min(1),
    account_external_id: z.string().optional(),
    ad_set_external_id: z.string().optional(),
    campaign_external_id: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    creative_type: z.string().optional(),
    thumbnail_url: z.string().optional(),
    headline: z.string().optional(),
    description: z.string().optional(),
    destination: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

const MetricSchema = z.object({
    date: z.string().min(8), // YYYY-MM-DD
    account_external_id: z.string().min(1),
    campaign_external_id: z.string().optional(),
    ad_set_external_id: z.string().optional(),
    ad_external_id: z.string().optional(),
    impressions: z.number().optional(),
    clicks: z.number().optional(),
    spend: z.number().optional(),
    leads: z.number().optional(),
    conversions_mql: z.number().optional(),
    conversions_opportunity: z.number().optional(),
    conversions_sale: z.number().optional(),
    revenue: z.number().optional(),
    ctr: z.number().optional(),
    cpc: z.number().optional(),
    cpm: z.number().optional(),
    cpl: z.number().optional(),
});

const IngestSchema = z.object({
    organizationId: z.string().uuid(),
    projectId: z.string().uuid(),
    platform: z.literal('meta'),
    accounts: z.array(AccountSchema).min(1),
    campaigns: z.array(CampaignSchema).optional(),
    adSets: z.array(AdSetSchema).optional(),
    creatives: z.array(CreativeSchema).optional(),
    metrics: z.array(MetricSchema).min(1),
});

export const maxDuration = 60;

/**
 * Ingestao de metricas/estruturas do Meta Ads (server-side, service role).
 * Espera um corpo validado por IngestSchema.
 */
export async function POST(req: Request) {
    const raw = await req.json().catch(() => null);
    const parsed = IngestSchema.safeParse(raw);
    if (!parsed.success) {
        return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
    }

    // Service role client to bypass RLS; relies on caller providing org/project corretos.
    const supabase = await createAdminClient();

    try {
        const result = await ingestAdsPayload(supabase, parsed.data);
        return json({ ok: true, ...result }, 201);
    } catch (err: any) {
        console.error('[ads/meta/ingest] failed:', err);
        return json({ error: err.message || 'Ingest failed' }, 500);
    }
}
