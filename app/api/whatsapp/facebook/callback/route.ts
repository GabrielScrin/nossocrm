"use server";

import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';

function html(message: string, status = 200) {
    return new Response(
        `<!doctype html><html><body style="font-family: sans-serif; padding: 24px; background: #0b1220; color: #e2e8f0;">
        <h2>WhatsApp</h2>
        <p>${message}</p>
        <a href="/whatsapp/settings" style="color:#38bdf8;">Voltar para o CR8</a>
        <script>setTimeout(()=>{window.location.href='/whatsapp/settings?connected=${status===200?1:0}'},1500)</script>
        </body></html>`,
        { status, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
}

async function fetchJSON(url: string) {
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Graph error (${res.status}): ${body}`);
    }
    return res.json();
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    if (!code) return html('Código ausente na resposta do Facebook', 400);

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI;
    if (!appId || !appSecret || !redirectUri) {
        return html('Variáveis META_APP_ID / META_APP_SECRET / META_REDIRECT_URI não configuradas', 500);
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return html('Usuário não autenticado', 401);

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();
    if (!profile?.organization_id) return html('Perfil sem organization_id', 404);

    try {
        const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
        tokenUrl.searchParams.set('client_id', appId);
        tokenUrl.searchParams.set('client_secret', appSecret);
        tokenUrl.searchParams.set('redirect_uri', redirectUri);
        tokenUrl.searchParams.set('code', code);

        const tokenResp = await fetchJSON(tokenUrl.toString());
        const accessToken: string = tokenResp.access_token;

        // Busca WABA e telefones
        const wabaResp = await fetchJSON(
            `https://graph.facebook.com/v18.0/me/whatsapp_business_accounts?access_token=${accessToken}`
        );
        const wabaId = wabaResp?.data?.[0]?.id;
        if (!wabaId) return html('Nenhuma conta WhatsApp Business encontrada neste perfil.', 400);

        const phonesResp = await fetchJSON(
            `https://graph.facebook.com/v18.0/${wabaId}/phone_numbers?fields=id,display_phone_number&access_token=${accessToken}`
        );
        const phone = phonesResp?.data?.[0];
        if (!phone?.id || !phone?.display_phone_number) {
            return html('Nenhum número de WhatsApp ativo encontrado.', 400);
        }

        const verifyToken = crypto.randomBytes(12).toString('hex');

        // Upsert da conta
        await supabase.from('whatsapp_accounts').upsert(
            {
                organization_id: profile.organization_id,
                phone_number: phone.display_phone_number,
                phone_id: phone.id,
                access_token: accessToken,
                verify_token: verifyToken,
                status: 'active',
            },
            { onConflict: 'organization_id,phone_number' }
        );

        return html('Conta WhatsApp conectada com sucesso! Verifique o webhook na Meta usando o verify_token gerado.', 200);
    } catch (err) {
        console.error('Facebook callback error', err);
        return html(err instanceof Error ? err.message : 'Erro desconhecido', 500);
    }
}

