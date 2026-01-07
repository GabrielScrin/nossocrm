import { createClient, createStaticAdminClient } from '@/lib/supabase/server';
import { appendOutboundMessage, registerHumanReply } from '@/lib/whatsapp/service';

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

type SendPayload = {
    conversationId: string;
    text: string;
};

export async function POST(req: Request) {
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

    const body = (await req.json().catch(() => null)) as SendPayload | null;
    if (!body?.conversationId || !body.text) return json({ error: 'Invalid payload' }, 400);

    const admin = createStaticAdminClient();
    const { data: conversation } = await admin
        .from('whatsapp_conversations')
        .select('id, phone_number, organization_id, account_id')
        .eq('id', body.conversationId)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();

    if (!conversation) return json({ error: 'Conversa não encontrada' }, 404);
    if (!conversation.account_id) return json({ error: 'Conta WhatsApp não vinculada' }, 400);

    const { data: account } = await admin
        .from('whatsapp_accounts')
        .select('id, phone_id, access_token')
        .eq('id', conversation.account_id)
        .maybeSingle();

    if (!account) return json({ error: 'Conta WhatsApp não encontrada' }, 404);

    // Humanos respondendo -> desligar IA automaticamente (handoff)
    await registerHumanReply(conversation.id, profile.organization_id, user.id);

    const url = `https://graph.facebook.com/v20.0/${account.phone_id}/messages`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${account.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: conversation.phone_number,
            type: 'text',
            text: { body: body.text },
        }),
    });

    const responseJson = await res.json().catch(() => ({}));
    if (!res.ok) {
        console.error('WhatsApp send error', responseJson);
        return json({ error: 'Falha ao enviar mensagem', details: responseJson }, 502);
    }

    const waId = responseJson?.messages?.[0]?.id as string | undefined;
    await appendOutboundMessage({
        conversation_id: conversation.id,
        organization_id: profile.organization_id,
        text: body.text,
        wa_message_id: waId,
    });

    return json({ ok: true, wa_message_id: waId }, 200);
}

