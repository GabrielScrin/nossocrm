import { createClient } from '@/lib/supabase/server';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Endpoint de debug para inspecionar a sessao atual.
 * Retorna user (auth) + profile (public.profiles) + host Supabase usado pelo server.
 * Nao modifica nada no banco.
 */
export async function GET() {
  const supabase = await createClient();
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) return json({ error: userError.message, supabaseUrl: envUrl }, 500);
  if (!user) return json({ error: 'Unauthorized', supabaseUrl: envUrl }, 401);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return json({
    supabaseUrl: envUrl,
    user: {
      id: user.id,
      email: user.email,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      created_at: user.created_at,
      aud: user.aud,
    },
    profile,
    profileError: profileError?.message || null,
  });
}
