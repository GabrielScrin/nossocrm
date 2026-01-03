import { createClient } from '@/lib/supabase/server';

function json<T>(body: T, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

type FunnelParams = {
    from: string;
    to: string;
    projectId?: string | null;
};

function parseDateRange(url: URL): FunnelParams {
    const now = new Date();
    const defaultTo = now.toISOString();
    const defaultFrom = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();

    const from = url.searchParams.get('from') || defaultFrom;
    const to = url.searchParams.get('to') || defaultTo;
    const projectId = url.searchParams.get('projectId');

    return { from, to, projectId: projectId || undefined };
}

function toDateKey(value: string) {
    return value.slice(0, 10);
}

/**
 * GET /api/analytics/funnel
 * Retorna série temporal de eventos de funil por dia
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

    const eventsQuery = supabase
        .from('funnel_events')
        .select('event_type, occurred_at')
        .eq('organization_id', profile.organization_id)
        .gte('occurred_at', from)
        .lte('occurred_at', to)
        .order('occurred_at', { ascending: true });

    if (projectId) {
        eventsQuery.eq('project_id', projectId);
    }

    const { data: events, error } = await eventsQuery;
    if (error) return json({ error: error.message }, 500);

    const series: Record<string, Record<string, number>> = {};
    for (const ev of events || []) {
        const dateKey = toDateKey((ev as any).occurred_at);
        const type = (ev as any).event_type as string;
        if (!series[dateKey]) {
            series[dateKey] = { impression: 0, click: 0, lead: 0, mql: 0, opportunity: 0, sale: 0 };
        }
        if (series[dateKey][type as keyof typeof series[string]] !== undefined) {
            series[dateKey][type as keyof typeof series[string]] += 1;
        }
    }

    const timeline = Object.entries(series)
        .sort(([a], [b]) => (a > b ? 1 : -1))
        .map(([date, values]) => ({
            date,
            ...values,
        }));

    return json({
        period: { from, to },
        projectId: projectId || null,
        timeline,
    });
}
