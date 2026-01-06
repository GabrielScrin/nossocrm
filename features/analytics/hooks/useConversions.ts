import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';

export type ConversionEvent = {
  id: string;
  lead_id: string | null;
  event_type: 'lead' | 'mql' | 'opportunity' | 'sale';
  platform: 'meta' | 'google' | null;
  status: string | null;
  attempted_at: string | null;
  created_at: string | null;
  payload_hash: string;
  reason?: string | null;
};

type Params = {
  from: string;
  to: string;
  projectId?: string | null;
};

async function fetchConversions(params: Params): Promise<ConversionEvent[]> {
  const search = new URLSearchParams();
  search.set('from', params.from);
  search.set('to', params.to);
  if (params.projectId) search.set('projectId', params.projectId);

  const res = await fetch(`/api/analytics/conversions?${search.toString()}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Falha ao carregar conversões (HTTP ${res.status})`);
  }

  const body = await res.json();
  return body?.conversions || [];
}

export function useConversions(params: Params) {
  const normalized = { ...params, projectId: params.projectId ?? undefined };
  return useQuery({
    queryKey: queryKeys.analytics.conversions(normalized),
    queryFn: () => fetchConversions(params),
    staleTime: 30_000,
  });
}
