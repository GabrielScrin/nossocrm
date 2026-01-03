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

    const metricsPromise = supabase
        .from('ad_metrics_daily')
        .select(`
            spend:sum(spend),
            impressions:sum(impressions),
            clicks:sum(clicks),
            leads:sum(leads),
            mqls:sum(conversions_mql),
            opportunities:sum(conversions_opportunity),
            sales:sum(conversions_sale),
            revenue:sum(revenue)
        `)
        .eq('organization_id', profile.organization_id)
        .gte('date', from)
        .lte('date', to)
        .limit(1);

    if (projectId) {
        metricsPromise.eq('project_id', projectId);
    }

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

    const agg = (metricsData && metricsData[0]) || {};

    const spend = safeNumber((agg as any).spend);
    const impressions = safeNumber((agg as any).impressions);
    const clicks = safeNumber((agg as any).clicks);
    const leads = safeNumber((agg as any).leads);
    const mqls = safeNumber((agg as any).mqls);
    const opportunities = safeNumber((agg as any).opportunities);
    const sales = safeNumber((agg as any).sales);
    const revenue = safeNumber((agg as any).revenue);

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
