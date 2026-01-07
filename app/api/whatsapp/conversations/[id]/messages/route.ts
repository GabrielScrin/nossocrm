import { createClient } from '@/lib/supabase/server';

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
    const params = await Promise.resolve(ctx.params);
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

    const { data: conversation, error: conversationError } = await supabase
        .from('whatsapp_conversations')
        .select(
            `
            id,
            phone_number,
            ai_enabled,
            status,
            contact:contact_id ( id, name ),
            lead:lead_id ( id, name ),
            whatsapp_messages ( id, direction, text, created_at, status )
        `
        )
        .eq('id', params.id)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();

    if (conversationError) return json({ error: conversationError.message }, 500);
    if (!conversation) return json({ error: 'Not found' }, 404);

    const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
    const lead = Array.isArray(conversation.lead) ? conversation.lead[0] : conversation.lead;

    const messages = (conversation.whatsapp_messages || []).sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return json({
        conversation: {
            id: conversation.id,
            phoneNumber: conversation.phone_number,
            aiEnabled: conversation.ai_enabled,
            status: conversation.status,
            contact: contact ? { id: contact.id, name: contact.name } : null,
            lead: lead ? { id: lead.id, name: lead.name } : null,
        },
        messages,
    });
}
