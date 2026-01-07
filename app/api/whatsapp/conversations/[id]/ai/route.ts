import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toggleConversationAI } from '@/lib/whatsapp/service';

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
    const params = await Promise.resolve(ctx.params);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();
    if (!profile?.organization_id) return json({ error: 'Profile not found' }, 404);

    const body = await req.json().catch(() => null);
    const enabled = typeof body?.enabled === 'boolean' ? body.enabled : null;
    if (enabled === null) return json({ error: 'enabled boolean required' }, 400);

    try {
        await toggleConversationAI({
            conversation_id: params.id,
            organization_id: profile.organization_id,
            enabled,
            by_user_id: user.id,
        });
        return json({ ok: true });
    } catch (err) {
        return json({ error: err instanceof Error ? err.message : 'unknown error' }, 400);
    }
}
