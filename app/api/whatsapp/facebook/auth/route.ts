import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function json(body: any, status = 400) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const appId = process.env.META_APP_ID;
    const redirectUri = process.env.META_REDIRECT_URI;

    if (!appId || !redirectUri) {
        return json({ error: 'META_APP_ID e META_REDIRECT_URI n\u00e3o configurados' }, 500);
    }

    const state = `wa-${user.id}`;
    const scopes = [
        'whatsapp_business_management',
        'whatsapp_business_messaging',
        'business_management',
    ].join(',');

    const oauthUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    oauthUrl.searchParams.set('client_id', appId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('state', state);
    oauthUrl.searchParams.set('scope', scopes);
    oauthUrl.searchParams.set('response_type', 'code');

    return Response.redirect(oauthUrl.toString(), 302);
}

