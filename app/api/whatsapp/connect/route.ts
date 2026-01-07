"use server";

import type { NextRequest } from "next/server";

/**
 * Redireciona para o OAuth do Facebook/Meta com os scopes de WhatsApp.
 * Usa META_APP_ID e META_REDIRECT_URI das variaveis de ambiente.
 */
export async function GET(req: NextRequest) {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return new Response(
      JSON.stringify({ error: "META_APP_ID e META_REDIRECT_URI nao configurados" }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const state = "wa-connect"; // pode incluir orgId/nonce se necessario
  const scopes = [
    "whatsapp_business_messaging",
    "whatsapp_business_management",
    "business_management",
  ].join(",");

  const oauthUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  oauthUrl.searchParams.set("client_id", appId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("scope", scopes);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state", state);

  return Response.redirect(oauthUrl.toString(), 302);
}
