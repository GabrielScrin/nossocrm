import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient, createStaticAdminClient } from '@/lib/supabase/server';

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

async function fetchJSON(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Graph error ${res.status}: ${text}`);
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => null);
    const code = body?.code as string | undefined;
    if (!code) return json({ error: 'Code is required' }, 400);

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI;
    if (!appId || !appSecret || !redirectUri) {
        return json({ error: 'META_APP_ID, META_APP_SECRET e META_REDIRECT_URI devem estar configurados' }, 500);
    }

    try {
        // Troca do code pelo access token
        const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
        tokenUrl.searchParams.set('client_id', appId);
        tokenUrl.searchParams.set('client_secret', appSecret);
        tokenUrl.searchParams.set('redirect_uri', redirectUri);
        tokenUrl.searchParams.set('code', code);

        const tokenResp = await fetchJSON(tokenUrl.toString());
        const accessToken = tokenResp?.access_token as string;
        if (!accessToken) throw new Error('Access token não retornado');

        // Busca WABA
        const wabaResp = await fetchJSON(
            `https://graph.facebook.com/v21.0/me/whatsapp_business_accounts?access_token=${accessToken}`
        );
        const wabaId = wabaResp?.data?.[0]?.id as string | undefined;
        if (!wabaId) throw new Error('Nenhuma conta WhatsApp Business encontrada');

        // Busca números
        const phonesResp = await fetchJSON(
            `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id,display_phone_number&access_token=${accessToken}`
        );
        const phone = phonesResp?.data?.[0];
        if (!phone?.id || !phone?.display_phone_number) {
            throw new Error('Nenhum número de WhatsApp ativo encontrado');
        }

        // Opcional: assinar eventos para o app nesse número
        try {
            await fetchJSON(
                `https://graph.facebook.com/v21.0/${phone.id}/subscribed_apps`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ access_token: accessToken }),
                }
            );
        } catch (err) {
            console.warn('Falha ao assinar subscribed_apps (seguindo mesmo assim):', err);
        }

        const verifyToken = crypto.randomBytes(12).toString('hex');

        const admin = createStaticAdminClient();
        await admin
            .from('whatsapp_accounts')
            .upsert(
                {
                    organization_id: profile.organization_id,
                    phone_number: phone.display_phone_number,
                    phone_id: phone.id,
                    waba_business_account_id: wabaId,
                    access_token: accessToken,
                    verify_token: verifyToken,
                    status: 'active',
                },
                { onConflict: 'organization_id,phone_number' }
            );

        return json({
            ok: true,
            phone_number: phone.display_phone_number,
            phone_id: phone.id,
            waba_id: wabaId,
            verify_token: verifyToken,
        });
    } catch (err) {
        return json({ error: err instanceof Error ? err.message : 'Erro desconhecido' }, 500);
    }
}

