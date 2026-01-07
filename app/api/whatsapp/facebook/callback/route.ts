"use server";

import type { NextRequest } from "next/server";
import crypto from "crypto";
import { createClient, createStaticAdminClient } from "@/lib/supabase/server";

function html(message: string, status = 200) {
  return new Response(
    `<!doctype html><html><body style="font-family: sans-serif; padding: 24px; background: #0b1220; color: #e2e8f0;">
      <h2>WhatsApp</h2>
      <p>${message}</p>
      <a href="/whatsapp/settings" style="color:#38bdf8;">Voltar para o CR8</a>
    </body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) return html(`Erro do Facebook: ${error}`, 400);
  if (!code) return html("Código ausente na resposta do Facebook", 400);

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    return html("META_APP_ID / META_APP_SECRET / META_REDIRECT_URI não configurados.", 500);
  }

  try {
    // Troca do code pelo access token
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResp = await fetchJSON(tokenUrl.toString());
    const accessToken = tokenResp?.access_token as string;
    if (!accessToken) throw new Error("Access token não retornado");

    // Busca WABA e telefone
    const wabaResp = await fetchJSON(
      `https://graph.facebook.com/v21.0/me/whatsapp_business_accounts?access_token=${accessToken}`
    );
    const wabaId = wabaResp?.data?.[0]?.id as string | undefined;
    if (!wabaId) throw new Error("Nenhuma conta WhatsApp Business encontrada");

    const phonesResp = await fetchJSON(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id,display_phone_number&access_token=${accessToken}`
    );
    const phone = phonesResp?.data?.[0];
    if (!phone?.id || !phone?.display_phone_number) {
      throw new Error("Nenhum número de WhatsApp ativo encontrado");
    }

    // Assina eventos no número (subscribed_apps)
    try {
      await fetchJSON(`https://graph.facebook.com/v21.0/${phone.id}/subscribed_apps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
    } catch (err) {
      console.warn("Falha ao assinar subscribed_apps (seguindo mesmo assim):", err);
    }

    // Recupera usuário logado (cookies)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return html("Usuário não autenticado", 401);

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.organization_id) return html("Perfil sem organization_id", 404);

    const verifyToken = crypto.randomBytes(12).toString("hex");
    const admin = createStaticAdminClient();
    await admin
      .from("whatsapp_accounts")
      .upsert(
        {
          organization_id: profile.organization_id,
          phone_number: phone.display_phone_number,
          phone_id: phone.id,
          waba_business_account_id: wabaId,
          access_token: accessToken,
          verify_token: verifyToken,
          status: "active",
        },
        { onConflict: "organization_id,phone_number" }
      );

    return html(
      `Conta conectada com sucesso! Número: ${phone.display_phone_number}. Use o verify_token gerado para validar o webhook.`,
      200
    );
  } catch (err) {
    return html(err instanceof Error ? err.message : "Erro desconhecido", 500);
  }
}

