import { createClient } from '@/lib/supabase/server';

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.organization_id) return json({ error: 'Profile not found' }, 404);

  const { data, error } = await supabase
    .from('whatsapp_accounts')
    .select('id, phone_number, status, created_at, waba_business_account_id')
    .eq('organization_id', profile.organization_id)
    .order('updated_at', { ascending: false });

  if (error) return json({ error: error.message }, 500);
  return json({ accounts: data || [] });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.organization_id) return json({ error: 'Profile not found' }, 404);

  const { error } = await supabase
    .from('whatsapp_accounts')
    .update({ status: 'inactive' })
    .eq('organization_id', profile.organization_id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

