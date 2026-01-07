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

type WabaAccount = { id: string; businessId: string };

async function fetchWabas(accessToken: string): Promise<WabaAccount[]> {
  const businessesResp = await fetchJSON(
    `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${accessToken}`
  );
  const businesses = Array.isArray(businessesResp?.data) ? businessesResp.data : [];
  const results: WabaAccount[] = [];
  const seen = new Set<string>();

  for (const business of businesses) {
    if (!business?.id) continue;
    const ownedResp = await fetchJSON(
      `https://graph.facebook.com/v21.0/${business.id}/owned_whatsapp_business_accounts?fields=id,name&access_token=${accessToken}`
    );
    if (Array.isArray(ownedResp?.data)) {
      for (const item of ownedResp.data) {
        if (item?.id && !seen.has(item.id)) {
          seen.add(item.id);
          results.push({ id: item.id, businessId: business.id });
        }
      }
    }

    try {
      const clientResp = await fetchJSON(
        `https://graph.facebook.com/v21.0/${business.id}/client_whatsapp_business_accounts?fields=id,name&access_token=${accessToken}`
      );
      if (Array.isArray(clientResp?.data)) {
        for (const item of clientResp.data) {
          if (item?.id && !seen.has(item.id)) {
            seen.add(item.id);
            results.push({ id: item.id, businessId: business.id });
          }
        }
      }
    } catch (err) {
      console.warn("Nao foi possivel listar client_whatsapp_business_accounts:", err);
    }
  }

  return results;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) return html(`Erro do Facebook: ${error}`, 400);
  if (!code) return html("Codigo ausente na resposta do Facebook", 400);

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    return html("META_APP_ID / META_APP_SECRET / META_REDIRECT_URI nao configurados.", 500);
  }

  try {
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResp = await fetchJSON(tokenUrl.toString());
    const accessToken = tokenResp?.access_token as string;
    if (!accessToken) throw new Error("Access token nao retornado");

    const wabaList = await fetchWabas(accessToken);
    const wabaId = wabaList[0]?.id as string | undefined;
    if (!wabaId) throw new Error("Nenhuma conta WhatsApp Business encontrada");

    const phonesResp = await fetchJSON(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id,display_phone_number&access_token=${accessToken}`
    );
    const phone = phonesResp?.data?.[0];
    if (!phone?.id || !phone?.display_phone_number) {
      throw new Error("Nenhum numero de WhatsApp ativo encontrado");
    }

    try {
      await fetchJSON(`https://graph.facebook.com/v21.0/${phone.id}/subscribed_apps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
    } catch (err) {
      console.warn("Falha ao assinar subscribed_apps (seguindo mesmo assim):", err);
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return html("Usuario nao autenticado", 401);

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
      `Conta conectada com sucesso! Numero: ${phone.display_phone_number}. Use o verify_token gerado para validar o webhook.`,
      200
    );
  } catch (err) {
    return html(err instanceof Error ? err.message : "Erro desconhecido", 500);
  }
}
