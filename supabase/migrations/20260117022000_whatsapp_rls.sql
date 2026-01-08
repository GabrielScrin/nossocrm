-- -----------------------------------------------------------------------------
-- WhatsApp RLS hardening (org-scoped access)
-- -----------------------------------------------------------------------------

-- Accounts: only admin/gestor should read/modify tokens
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.whatsapp_accounts;
DROP POLICY IF EXISTS "whatsapp_accounts_select" ON public.whatsapp_accounts;
DROP POLICY IF EXISTS "whatsapp_accounts_modify" ON public.whatsapp_accounts;

CREATE POLICY "whatsapp_accounts_select" ON public.whatsapp_accounts
  FOR SELECT TO authenticated
  USING (public.is_admin_or_gestor(organization_id));

CREATE POLICY "whatsapp_accounts_modify" ON public.whatsapp_accounts
  FOR ALL TO authenticated
  USING (public.is_admin_or_gestor(organization_id))
  WITH CHECK (public.is_admin_or_gestor(organization_id));

-- Conversations: org members can read/write
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "whatsapp_conversations_access" ON public.whatsapp_conversations;

CREATE POLICY "whatsapp_conversations_access" ON public.whatsapp_conversations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = whatsapp_conversations.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = whatsapp_conversations.organization_id
    )
  );

-- Messages: org members can read/write
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "whatsapp_messages_access" ON public.whatsapp_messages;

CREATE POLICY "whatsapp_messages_access" ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = whatsapp_messages.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = whatsapp_messages.organization_id
    )
  );

-- Handoffs: org members can read/write
ALTER TABLE public.whatsapp_handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.whatsapp_handoffs;
DROP POLICY IF EXISTS "whatsapp_handoffs_access" ON public.whatsapp_handoffs;

CREATE POLICY "whatsapp_handoffs_access" ON public.whatsapp_handoffs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = whatsapp_handoffs.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = whatsapp_handoffs.organization_id
    )
  );
