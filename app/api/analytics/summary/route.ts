import { createClient } from '@/lib/supabase/server';

function json<T>(body: T, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

type SummaryParams = {
    from: string;
    to: string;
    projectId?: string | null;
};

function parseDateRange(url: URL): SummaryParams {
    const now = new Date();
    const defaultTo = now.toISOString().slice(0, 10);
    const defaultFrom = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const from = url.searchParams.get('from') || defaultFrom;
    const to = url.searchParams.get('to') || defaultTo;
    const projectId = url.searchParams.get('projectId');

    return { from, to, projectId: projectId || undefined };
}

function safeNumber(value: unknown): number {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : 0;
}

/**
 * GET /api/analytics/summary
 * Retorna métricas agregadas de mídia + funil para o período/projeto
 */
export async function GET(req: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError || !profile?.organization_id) {
        return json({ error: 'Profile not found' }, 404);
    }

    const { from, to, projectId } = parseDateRange(new URL(req.url));

    // Fetch raw rows and aggregate in Node to avoid PostgREST relationship/aggregate parsing issues
    const metricsPromise = (() => {
        const query = supabase
            .from('ad_metrics_daily')
            .select(
                'spend, impressions, clicks, leads, conversions_mql, conversions_opportunity, conversions_sale, revenue'
            )
            .eq('organization_id', profile.organization_id)
            .gte('date', from)
            .lte('date', to);
        if (projectId) query.eq('project_id', projectId);
        return query;
    })();

    const funnelPromise = (() => {
        const query = supabase
            .from('funnel_events')
            .select('event_type')
            .eq('organization_id', profile.organization_id)
            .gte('occurred_at', `${from}T00:00:00Z`)
            .lte('occurred_at', `${to}T23:59:59Z`);
        if (projectId) query.eq('project_id', projectId);
        return query;
    })();

    const [{ data: metricsData, error: metricsError }, { data: funnelData, error: funnelError }] = await Promise.all([
        metricsPromise,
        funnelPromise,
    ]);

    if (metricsError) return json({ error: metricsError.message }, 500);
    if (funnelError) return json({ error: funnelError.message }, 500);

    const agg = (metricsData || []).reduce(
        (acc, row) => {
            acc.spend += safeNumber((row as any).spend);
            acc.impressions += safeNumber((row as any).impressions);
            acc.clicks += safeNumber((row as any).clicks);
            acc.leads += safeNumber((row as any).leads);
            acc.mqls += safeNumber((row as any).conversions_mql);
            acc.opportunities += safeNumber((row as any).conversions_opportunity);
            acc.sales += safeNumber((row as any).conversions_sale);
            acc.revenue += safeNumber((row as any).revenue);
            return acc;
        },
        {
            spend: 0,
            impressions: 0,
            clicks: 0,
            leads: 0,
            mqls: 0,
            opportunities: 0,
            sales: 0,
            revenue: 0,
        }
    );

    const spend = agg.spend;
    const impressions = agg.impressions;
    const clicks = agg.clicks;
    const leads = agg.leads;
    const mqls = agg.mqls;
    const opportunities = agg.opportunities;
    const sales = agg.sales;
    const revenue = agg.revenue;

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const cpl = leads > 0 ? spend / leads : 0;
    const roas = spend > 0 ? revenue / spend : 0;

    const funnelCounts: Record<string, number> = {};
    for (const item of funnelData || []) {
        const key = (item as any).event_type as string;
        funnelCounts[key] = (funnelCounts[key] || 0) + 1;
    }

    return json({
        period: { from, to },
        projectId: projectId || null,
        metrics: {
            spend,
            impressions,
            clicks,
            ctr,
            cpc,
            cpm,
            leads,
            mqls,
            opportunities,
            sales,
            revenue,
            cpl,
            roas,
        },
        funnel: {
            impression: funnelCounts.impression || 0,
            click: funnelCounts.click || 0,
            lead: funnelCounts.lead || leads, // fallback to metrics
            mql: funnelCounts.mql || mqls,
            opportunity: funnelCounts.opportunity || opportunities,
            sale: funnelCounts.sale || sales,
        },
    });
}
