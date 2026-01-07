-- -----------------------------------------------------------------------------
-- Link whatsapp_conversations to whatsapp_accounts
-- -----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_conversations
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_conversations_account_idx
    ON public.whatsapp_conversations (account_id);

