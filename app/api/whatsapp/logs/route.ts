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
        .from('whatsapp_handoffs')
        .select(
            `
            id,
            from_state,
            to_state,
            reason,
            created_at,
            conversation:conversation_id ( id, phone_number, contact:contact_id ( name ) ),
            user:by_user_id ( email )
        `
        )
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) return json({ error: error.message }, 500);

    const logs = (data || []).map((item: any) => ({
        id: item.id,
        from: item.from_state,
        to: item.to_state,
        reason: item.reason,
        createdAt: item.created_at,
        conversation: item.conversation
            ? {
                  id: item.conversation.id,
                  phoneNumber: item.conversation.phone_number,
                  contactName: item.conversation.contact?.name || null,
              }
            : null,
        by: item.user?.email || null,
    }));

    return json({ logs });
}

