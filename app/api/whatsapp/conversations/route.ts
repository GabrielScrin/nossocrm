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
        .from('whatsapp_conversations')
        .select(
            `
            id,
            phone_number,
            ai_enabled,
            last_message_at,
            status,
            contact:contact_id ( id, name ),
            whatsapp_messages ( text, direction, created_at order=created_at.desc limit=1 )
        `
        )
        .eq('organization_id', profile.organization_id)
        .order('last_message_at', { ascending: false })
        .limit(50);

    if (error) return json({ error: error.message }, 500);

    // Normalize last message (first item of nested messages)
    const conversations = (data || []).map((c: any) => ({
        id: c.id,
        phoneNumber: c.phone_number,
        aiEnabled: c.ai_enabled,
        lastMessageAt: c.last_message_at,
        status: c.status,
        contact: c.contact ? { id: c.contact.id, name: c.contact.name } : null,
        lastMessage:
            Array.isArray(c.whatsapp_messages) && c.whatsapp_messages.length > 0
                ? c.whatsapp_messages[0]
                : null,
    }));

    return json({ conversations });
}
