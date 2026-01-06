import { createClient } from '@/lib/supabase/server';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

type QueryParams = {
  from: string;
  to: string;
  projectId?: string | null;
};

function parseDateRange(url: URL): QueryParams {
  const now = new Date();
  const defaultTo = now.toISOString();
  const defaultFrom = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();

  const from = url.searchParams.get('from') || defaultFrom;
  const to = url.searchParams.get('to') || defaultTo;
  const projectId = url.searchParams.get('projectId');

  return { from, to, projectId: projectId || undefined };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  let query = supabase
    .from('conversion_events')
    .select('id, lead_id, event_type, platform, status, attempted_at, created_at, payload_hash, external_response, project_id')
    .eq('organization_id', profile.organization_id)
    .order('attempted_at', { ascending: false })
    .limit(200);

  if (projectId) query = query.eq('project_id', projectId);
  if (from) query = query.gte('attempted_at', from);
  if (to) query = query.lte('attempted_at', to);

  const { data, error } = await query;

  if (error) return json({ error: error.message }, 500);

  const conversions = (data || []).map((c: any) => ({
    id: c.id,
    lead_id: c.lead_id,
    event_type: c.event_type,
    platform: c.platform,
    status: c.status,
    attempted_at: c.attempted_at,
    created_at: c.created_at,
    payload_hash: c.payload_hash,
    reason: c.external_response?.error || c.external_response?.message || c.external_response?.details || null,
  }));

  return json({ conversions });
}
