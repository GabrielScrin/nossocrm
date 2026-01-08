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
        .from('whatsapp_messages')
        .select(
            `
            id,
            direction,
            status,
            error,
            text,
            created_at,
            sent_at,
            received_at,
            conversation:conversation_id ( id, phone_number, contact:contact_id ( name ) )
        `
        )
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) return json({ error: error.message }, 500);

    const logs = (data || []).map((item: any) => ({
        id: item.id,
        direction: item.direction,
        status: item.status,
        error: item.error,
        text: item.text,
        occurredAt: item.sent_at || item.received_at || item.created_at,
        conversation: item.conversation
            ? {
                  id: item.conversation.id,
                  phoneNumber: item.conversation.phone_number,
                  contactName: item.conversation.contact?.name || null,
              }
            : null,
    }));

    return json({ logs });
}
