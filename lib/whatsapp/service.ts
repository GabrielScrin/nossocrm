import { createStaticAdminClient } from '@/lib/supabase/server';

type WhatsAppMessage = {
    from: string;
    id: string;
    timestamp?: string;
    text?: { body?: string };
    type?: string;
};

type WebhookChange = {
    value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        messages?: WhatsAppMessage[];
    };
};

type WebhookPayload = {
    object?: string;
    entry?: { changes?: WebhookChange[] }[];
};

function normalizePhone(phone: string) {
    const digits = phone.replace(/[^\d]/g, '');
    return digits.startsWith('+') ? digits : `+${digits}`;
}

async function getAccountByPhoneId(phoneId: string) {
    const admin = createStaticAdminClient();
    const { data, error } = await admin
        .from('whatsapp_accounts')
        .select('*')
        .eq('phone_id', phoneId)
        .limit(1)
        .maybeSingle();
    if (error || !data) {
        return null;
    }
    return data;
}

async function getOrCreateContact(params: { organization_id: string; phone: string; name?: string }) {
    const admin = createStaticAdminClient();
    const { data: existing } = await admin
        .from('contacts')
        .select('id, name')
        .eq('organization_id', params.organization_id)
        .eq('phone', params.phone)
        .limit(1)
        .maybeSingle();

    if (existing) return existing;

    const name = params.name?.trim() || `WhatsApp ${params.phone}`;
    const { data, error } = await admin
        .from('contacts')
        .insert({
            organization_id: params.organization_id,
            name,
            phone: params.phone,
            source: 'whatsapp',
        })
        .select('id, name')
        .maybeSingle();
    if (error || !data) {
        throw new Error(`Falha ao criar contato WhatsApp: ${error?.message}`);
    }
    return data;
}

async function getOrCreateConversation(params: {
    account_id: string;
    organization_id: string;
    phone: string;
    contact_id: string;
    ai_enabled: boolean;
}) {
    const admin = createStaticAdminClient();
    const { data: existing } = await admin
        .from('whatsapp_conversations')
        .select('id, lead_id, ai_enabled')
        .eq('organization_id', params.organization_id)
        .eq('phone_number', params.phone)
        .limit(1)
        .maybeSingle();

    if (existing) return existing;

    const { data, error } = await admin
        .from('whatsapp_conversations')
        .insert({
            organization_id: params.organization_id,
            account_id: params.account_id,
            phone_number: params.phone,
            contact_id: params.contact_id,
            ai_enabled: params.ai_enabled,
        })
        .select('id, lead_id, ai_enabled')
        .maybeSingle();
    if (error || !data) throw new Error(`Falha ao criar conversa: ${error?.message || 'desconhecido'}`);
    return data;
}

async function ensureLeadAndDeal(params: {
    organization_id: string;
    contact_id: string;
    phone: string;
    conversation_id: string;
    existing_lead_id?: string | null;
}) {
    const admin = createStaticAdminClient();
    let leadId = params.existing_lead_id;

    if (!leadId) {
        const { data: lead, error: leadError } = await admin
            .from('leads')
            .insert({
                organization_id: params.organization_id,
                name: `Lead WhatsApp ${params.phone}`,
                source: 'whatsapp',
                converted_to_contact_id: params.contact_id,
            })
            .select('id')
            .maybeSingle();
        if (leadError) throw new Error(`Falha ao criar lead: ${leadError.message}`);
        leadId = lead?.id || null;

        if (leadId) {
            await admin
                .from('whatsapp_conversations')
                .update({ lead_id: leadId })
                .eq('id', params.conversation_id)
                .eq('organization_id', params.organization_id);
        }
    }

    // Cria deal apenas se ainda não houver um vinculado; neste MVP não há coluna direta, então criamos solto.
    await admin.from('deals').insert({
        organization_id: params.organization_id,
        title: `Lead WhatsApp ${params.phone}`,
        contact_id: params.contact_id,
        tags: ['whatsapp'],
    });
}

async function insertMessage(params: {
    organization_id: string;
    conversation_id: string;
    direction: 'in' | 'out';
    wa_message_id?: string;
    text?: string;
    type?: string;
    raw?: any;
    ts?: string;
}) {
    const admin = createStaticAdminClient();
    const sentAt = params.ts ? new Date(Number(params.ts) * 1000) : undefined;
    try {
        await admin
            .from('whatsapp_messages')
            .insert({
                organization_id: params.organization_id,
                conversation_id: params.conversation_id,
                direction: params.direction,
                wa_message_id: params.wa_message_id,
                text: params.text,
                type: params.type || 'text',
                raw: params.raw ?? null,
                received_at: params.direction === 'in' ? sentAt : null,
                sent_at: params.direction === 'out' ? sentAt : null,
            })
            .maybeSingle();
    } catch {
        // Provavelmente duplicado pelo wa_message_id, ignorar.
    }

    await admin
        .from('whatsapp_conversations')
        .update({ last_message_at: sentAt || new Date() })
        .eq('id', params.conversation_id)
        .eq('organization_id', params.organization_id);
}

async function logHandoff(params: {
    organization_id: string;
    conversation_id: string;
    from_state?: string | null;
    to_state: string;
    reason: string;
    by_user_id?: string | null;
}) {
    const admin = createStaticAdminClient();
    await admin.from('whatsapp_handoffs').insert({
        organization_id: params.organization_id,
        conversation_id: params.conversation_id,
        from_state: params.from_state || null,
        to_state: params.to_state,
        reason: params.reason,
        by_user_id: params.by_user_id || null,
    });
}

const KEYWORD_HANDOFF = ['humano', 'atendente', 'pessoa', 'suporte', 'falar com'];

function shouldHandoffToHuman(text?: string) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return KEYWORD_HANDOFF.some((kw) => lower.includes(kw));
}

export async function handleWhatsAppWebhook(payload: WebhookPayload) {
    if (!payload?.entry?.length) {
        return { handled: false, reason: 'no_entry' };
    }

    for (const entry of payload.entry) {
        for (const change of entry.changes || []) {
            const phoneId = change.value?.metadata?.phone_number_id;
            if (!phoneId) continue;

            const account = await getAccountByPhoneId(phoneId);
            if (!account) continue;

            const messages = change.value?.messages || [];
            for (const msg of messages) {
                const phone = normalizePhone(msg.from);
                const text = msg.text?.body;
                const contact = await getOrCreateContact({
                    organization_id: account.organization_id,
                    phone,
                    name: undefined,
                });

                const conversation = await getOrCreateConversation({
                    account_id: account.id,
                    organization_id: account.organization_id,
                    phone,
                    contact_id: contact.id,
                    ai_enabled: account.ai_enabled ?? true,
                });

                await ensureLeadAndDeal({
                    organization_id: account.organization_id,
                    contact_id: contact.id,
                    phone,
                    conversation_id: conversation.id,
                    existing_lead_id: conversation.lead_id,
                });

                if (shouldHandoffToHuman(text) && conversation.ai_enabled) {
                    await createStaticAdminClient()
                        .from('whatsapp_conversations')
                        .update({ ai_enabled: false })
                        .eq('id', conversation.id);
                    await logHandoff({
                        organization_id: account.organization_id,
                        conversation_id: conversation.id,
                        from_state: 'ai',
                        to_state: 'human',
                        reason: 'keyword',
                    });
                }

                await insertMessage({
                    organization_id: account.organization_id,
                    conversation_id: conversation.id,
                    direction: 'in',
                    wa_message_id: msg.id,
                    text,
                    type: msg.type || 'text',
                    raw: msg,
                    ts: msg.timestamp,
                });
            }
        }
    }

    return { handled: true };
}

export async function toggleConversationAI(params: {
    conversation_id: string;
    organization_id: string;
    enabled: boolean;
    by_user_id?: string;
}) {
    const admin = createStaticAdminClient();
    const { data: existing } = await admin
        .from('whatsapp_conversations')
        .select('ai_enabled')
        .eq('id', params.conversation_id)
        .eq('organization_id', params.organization_id)
        .maybeSingle();
    if (!existing) throw new Error('Conversa não encontrada');

    if (existing.ai_enabled === params.enabled) return;

    await admin
        .from('whatsapp_conversations')
        .update({ ai_enabled: params.enabled })
        .eq('id', params.conversation_id)
        .eq('organization_id', params.organization_id);

    await logHandoff({
        organization_id: params.organization_id,
        conversation_id: params.conversation_id,
        from_state: existing.ai_enabled ? 'ai' : 'human',
        to_state: params.enabled ? 'ai' : 'human',
        reason: 'manual_toggle',
        by_user_id: params.by_user_id,
    });
}

export async function registerHumanReply(conversationId: string, organizationId: string, by_user_id?: string) {
    const admin = createStaticAdminClient();
    const { data: existing } = await admin
        .from('whatsapp_conversations')
        .select('ai_enabled')
        .eq('id', conversationId)
        .eq('organization_id', organizationId)
        .maybeSingle();
    if (!existing) return;
    if (!existing.ai_enabled) return;

    await admin
        .from('whatsapp_conversations')
        .update({ ai_enabled: false })
        .eq('id', conversationId);

    await logHandoff({
        organization_id: organizationId,
        conversation_id: conversationId,
        from_state: 'ai',
        to_state: 'human',
        reason: 'human_reply',
        by_user_id,
    });
}

export async function appendOutboundMessage(params: {
    conversation_id: string;
    organization_id: string;
    text: string;
    wa_message_id?: string;
    ts?: string;
}) {
    await insertMessage({
        organization_id: params.organization_id,
        conversation_id: params.conversation_id,
        direction: 'out',
        wa_message_id: params.wa_message_id,
        text: params.text,
        ts: params.ts,
    });
}
