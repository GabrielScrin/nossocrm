import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';

type SummaryParams = {
    from: string;
    to: string;
    projectId?: string | null;
};

export type AnalyticsSummary = {
    period: { from: string; to: string };
    projectId: string | null;
    metrics: {
        spend: number;
        impressions: number;
        clicks: number;
        ctr: number;
        cpc: number;
        cpm: number;
        leads: number;
        mqls: number;
        opportunities: number;
        sales: number;
        revenue: number;
        cpl: number;
        roas: number;
    };
    funnel: {
        impression: number;
        click: number;
        lead: number;
        mql: number;
        opportunity: number;
        sale: number;
    };
};

async function fetchSummary(params: SummaryParams): Promise<AnalyticsSummary> {
    const search = new URLSearchParams();
    search.set('from', params.from);
    search.set('to', params.to);
    if (params.projectId) search.set('projectId', params.projectId);

    const res = await fetch(`/api/analytics/summary?${search.toString()}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'include',
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Falha ao carregar analytics (HTTP ${res.status})`);
    }

    return res.json();
}

export function useAnalyticsSummary(params: SummaryParams) {
    return useQuery({
        queryKey: queryKeys.analytics.summary(params),
        queryFn: () => fetchSummary(params),
        staleTime: 60_000,
    });
}
