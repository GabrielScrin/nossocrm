import { createStaticAdminClient } from '@/lib/supabase/server';
import { handleWhatsAppWebhook } from '@/lib/whatsapp/service';

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

// Verificação (GET) usada pelo WhatsApp para validar o webhook
export async function GET(req: Request) {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || !challenge) {
        return json({ error: 'invalid verification payload' }, 400);
    }

    // Confere se o verify_token existe em alguma conta
    const admin = createStaticAdminClient();
    const { data } = await admin
        .from('whatsapp_accounts')
        .select('id')
        .eq('verify_token', token)
        .limit(1)
        .maybeSingle();

    if (!data) {
        return json({ error: 'verify token not found' }, 403);
    }

    return new Response(challenge, { status: 200 });
}

// Recebimento de mensagens/eventos
export async function POST(req: Request) {
    const payload = await req.json().catch(() => null);
    if (!payload) return json({ error: 'invalid payload' }, 400);

    try {
        const result = await handleWhatsAppWebhook(payload);
        return json(result, 200);
    } catch (err) {
        console.error('WhatsApp webhook error', err);
        return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
}

