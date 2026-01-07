-- -----------------------------------------------------------------------------
-- WhatsApp Channel (accounts, conversations, messages, handoffs)
-- -----------------------------------------------------------------------------

-- Accounts / channel configuration
CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    phone_id TEXT NOT NULL,
    waba_business_account_id TEXT,
    access_token TEXT NOT NULL,
    verify_token TEXT NOT NULL,
    agent_default_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ai_enabled BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'inactive',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_org_phone_idx
    ON public.whatsapp_accounts (organization_id, phone_number);

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users"
    ON public.whatsapp_accounts FOR ALL TO authenticated USING (true);

-- Conversations (thread state)
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    wa_conversation_id TEXT,
    ai_enabled BOOLEAN DEFAULT TRUE,
    assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_conversations_org_updated_idx
    ON public.whatsapp_conversations (organization_id, last_message_at DESC);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users"
    ON public.whatsapp_conversations FOR ALL TO authenticated USING (true);

-- Messages (in/out)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('in','out')),
    wa_message_id TEXT,
    type TEXT DEFAULT 'text',
    text TEXT,
    status TEXT,
    error TEXT,
    raw JSONB,
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id_idx
    ON public.whatsapp_messages (wa_message_id);

CREATE INDEX IF NOT EXISTS whatsapp_messages_conv_idx
    ON public.whatsapp_messages (conversation_id, received_at DESC);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users"
    ON public.whatsapp_messages FOR ALL TO authenticated USING (true);

-- Handoff / audit log
CREATE TABLE IF NOT EXISTS public.whatsapp_handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
    from_state TEXT,
    to_state TEXT,
    reason TEXT,
    by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_handoffs_conv_idx
    ON public.whatsapp_handoffs (conversation_id, created_at DESC);

ALTER TABLE public.whatsapp_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users"
    ON public.whatsapp_handoffs FOR ALL TO authenticated USING (true);

