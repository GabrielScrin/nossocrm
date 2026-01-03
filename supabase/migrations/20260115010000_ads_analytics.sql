-- =============================================================================
-- Ads Analytics & Funnel Schema (Meta/Google) - Phase 1
-- - Dimensions: ad_accounts, ad_campaigns, ad_sets, ad_creatives
-- - Facts: ad_metrics_daily, funnel_events, attribution_keys, conversion_events
-- - External CRM mirror: external_crm_accounts, external_crm_leads
-- - Project-aware with has_project_access / is_admin_or_gestor
-- =============================================================================

-- Helpers ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ad_use_account_scope()
RETURNS trigger AS $$
DECLARE
  v_org uuid;
  v_project uuid;
  v_platform text;
BEGIN
  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'account_id is required';
  END IF;

  SELECT organization_id, project_id, platform
    INTO v_org, v_project, v_platform
  FROM public.ad_accounts
  WHERE id = NEW.account_id;

  IF v_org IS NULL OR v_project IS NULL THEN
    RAISE EXCEPTION 'ad_account not found or missing scope';
  END IF;

  NEW.organization_id := v_org;
  NEW.project_id := v_project;

  IF NEW.platform IS NULL THEN
    NEW.platform := v_platform;
  ELSIF NEW.platform <> v_platform THEN
    RAISE EXCEPTION 'platform mismatch with ad_account';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.funnel_use_lead_scope()
RETURNS trigger AS $$
DECLARE
  v_org uuid;
  v_project uuid;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT organization_id, project_id
      INTO v_org, v_project
    FROM public.leads
    WHERE id = NEW.lead_id;

    IF v_org IS NULL OR v_project IS NULL THEN
      RAISE EXCEPTION 'lead not found or missing scope';
    END IF;

    NEW.organization_id := v_org;
    NEW.project_id := v_project;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NEW.project_id IS NULL THEN
    NEW.project_id := public.get_default_project_id(NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dimensions ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google')),
  external_id text NOT NULL,
  name text,
  status text,
  currency text,
  timezone text,
  metadata jsonb,
  sync_cursor jsonb,
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, platform, external_id)
);

ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ad_accounts_org_platform ON public.ad_accounts (organization_id, platform);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_project ON public.ad_accounts (project_id);

DROP TRIGGER IF EXISTS trg_ad_accounts_project ON public.ad_accounts;
CREATE TRIGGER trg_ad_accounts_project
  BEFORE INSERT OR UPDATE ON public.ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_default();

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google')),
  external_id text NOT NULL,
  name text,
  status text,
  objective text,
  start_date date,
  end_date date,
  budget numeric,
  budget_type text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (account_id, external_id)
);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_account ON public.ad_campaigns (account_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_project ON public.ad_campaigns (project_id);

DROP TRIGGER IF EXISTS trg_ad_campaigns_scope ON public.ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_scope
  BEFORE INSERT OR UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.ad_use_account_scope();

CREATE TABLE IF NOT EXISTS public.ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google')),
  external_id text NOT NULL,
  name text,
  status text,
  optimization_goal text,
  bid_strategy text,
  daily_budget numeric,
  start_date date,
  end_date date,
  targeting jsonb,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (account_id, external_id)
);

ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ad_sets_account ON public.ad_sets (account_id);
CREATE INDEX IF NOT EXISTS idx_ad_sets_campaign ON public.ad_sets (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_sets_project ON public.ad_sets (project_id);

DROP TRIGGER IF EXISTS trg_ad_sets_scope ON public.ad_sets;
CREATE TRIGGER trg_ad_sets_scope
  BEFORE INSERT OR UPDATE ON public.ad_sets
  FOR EACH ROW EXECUTE FUNCTION public.ad_use_account_scope();

CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  ad_set_id uuid REFERENCES public.ad_sets(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google')),
  external_id text NOT NULL,
  name text,
  status text,
  creative_type text,
  thumbnail_url text,
  headline text,
  description text,
  destination text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (account_id, external_id)
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ad_creatives_account ON public.ad_creatives (account_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_project ON public.ad_creatives (project_id);

DROP TRIGGER IF EXISTS trg_ad_creatives_scope ON public.ad_creatives;
CREATE TRIGGER trg_ad_creatives_scope
  BEFORE INSERT OR UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.ad_use_account_scope();

-- Facts -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_metrics_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  ad_set_id uuid REFERENCES public.ad_sets(id) ON DELETE SET NULL,
  ad_id uuid REFERENCES public.ad_creatives(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('meta', 'google')),
  date date NOT NULL,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric DEFAULT 0,
  leads bigint DEFAULT 0,
  conversions_mql bigint DEFAULT 0,
  conversions_opportunity bigint DEFAULT 0,
  conversions_sale bigint DEFAULT 0,
  revenue numeric DEFAULT 0,
  cpc numeric,
  cpm numeric,
  ctr numeric,
  cpl numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, platform, account_id, date, campaign_id, ad_set_id, ad_id)
);

ALTER TABLE public.ad_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_org_date ON public.ad_metrics_daily (organization_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_account_date ON public.ad_metrics_daily (account_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_project_date ON public.ad_metrics_daily (project_id, date);

DROP TRIGGER IF EXISTS trg_ad_metrics_scope ON public.ad_metrics_daily;
CREATE TRIGGER trg_ad_metrics_scope
  BEFORE INSERT OR UPDATE ON public.ad_metrics_daily
  FOR EACH ROW EXECUTE FUNCTION public.ad_use_account_scope();

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'lead', 'mql', 'opportunity', 'sale')),
  platform text CHECK (platform IN ('meta', 'google', 'crm')),
  account_id uuid REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  ad_set_id uuid REFERENCES public.ad_sets(id) ON DELETE SET NULL,
  ad_id uuid REFERENCES public.ad_creatives(id) ON DELETE SET NULL,
  click_id text,
  gclid text,
  fbclid text,
  amount numeric,
  currency text,
  source text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_funnel_events_org_event ON public.funnel_events (organization_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_lead ON public.funnel_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_project ON public.funnel_events (project_id);

DROP TRIGGER IF EXISTS trg_funnel_events_scope ON public.funnel_events;
CREATE TRIGGER trg_funnel_events_scope
  BEFORE INSERT OR UPDATE ON public.funnel_events
  FOR EACH ROW EXECUTE FUNCTION public.funnel_use_lead_scope();

CREATE TABLE IF NOT EXISTS public.attribution_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text CHECK (platform IN ('meta', 'google')),
  account_id uuid REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  ad_set_id uuid REFERENCES public.ad_sets(id) ON DELETE SET NULL,
  ad_id uuid REFERENCES public.ad_creatives(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  click_id text,
  gclid text,
  fbclid text,
  occurred_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.attribution_keys ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_attribution_keys_click ON public.attribution_keys (click_id, gclid, fbclid);
CREATE INDEX IF NOT EXISTS idx_attribution_keys_lead ON public.attribution_keys (lead_id);
CREATE INDEX IF NOT EXISTS idx_attribution_keys_project ON public.attribution_keys (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attribution_keys_click_unique
  ON public.attribution_keys (organization_id, click_id)
  WHERE click_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attribution_keys_gclid_unique
  ON public.attribution_keys (organization_id, gclid)
  WHERE gclid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attribution_keys_fbclid_unique
  ON public.attribution_keys (organization_id, fbclid)
  WHERE fbclid IS NOT NULL;

DROP TRIGGER IF EXISTS trg_attribution_keys_scope ON public.attribution_keys;
CREATE TRIGGER trg_attribution_keys_scope
  BEFORE INSERT OR UPDATE ON public.attribution_keys
  FOR EACH ROW EXECUTE FUNCTION public.funnel_use_lead_scope();

CREATE TABLE IF NOT EXISTS public.conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('lead', 'mql', 'opportunity', 'sale')),
  platform text CHECK (platform IN ('meta', 'google')),
  payload_hash text NOT NULL,
  status text DEFAULT 'pending',
  external_response jsonb,
  attempted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, lead_id, event_type, platform, payload_hash)
);

ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_conversion_events_lead ON public.conversion_events (lead_id, event_type);
CREATE INDEX IF NOT EXISTS idx_conversion_events_project ON public.conversion_events (project_id);

DROP TRIGGER IF EXISTS trg_conversion_events_scope ON public.conversion_events;
CREATE TRIGGER trg_conversion_events_scope
  BEFORE INSERT OR UPDATE ON public.conversion_events
  FOR EACH ROW EXECUTE FUNCTION public.funnel_use_lead_scope();

-- External CRM mirror ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_crm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider text NOT NULL,
  name text,
  auth jsonb,
  config jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.external_crm_accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_external_crm_accounts_project ON public.external_crm_accounts (project_id);

DROP TRIGGER IF EXISTS trg_external_crm_accounts_project ON public.external_crm_accounts;
CREATE TRIGGER trg_external_crm_accounts_project
  BEFORE INSERT OR UPDATE ON public.external_crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_default();

CREATE TABLE IF NOT EXISTS public.external_crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  external_crm_account_id uuid REFERENCES public.external_crm_accounts(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  stage text,
  payload jsonb,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (external_crm_account_id, external_id)
);

ALTER TABLE public.external_crm_leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_external_crm_leads_project ON public.external_crm_leads (project_id);
CREATE INDEX IF NOT EXISTS idx_external_crm_leads_lead ON public.external_crm_leads (lead_id);

DROP TRIGGER IF EXISTS trg_external_crm_leads_scope ON public.external_crm_leads;
CREATE TRIGGER trg_external_crm_leads_scope
  BEFORE INSERT OR UPDATE ON public.external_crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.funnel_use_lead_scope();

-- RLS policies ----------------------------------------------------------------
-- ad_accounts: read for project members, mutate only admin/gestor
DROP POLICY IF EXISTS "ad_accounts_select" ON public.ad_accounts;
CREATE POLICY "ad_accounts_select" ON public.ad_accounts
  FOR SELECT TO authenticated
  USING (public.has_project_access(project_id, organization_id));

DROP POLICY IF EXISTS "ad_accounts_modify" ON public.ad_accounts;
CREATE POLICY "ad_accounts_modify" ON public.ad_accounts
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id));

-- ad_campaigns
DROP POLICY IF EXISTS "ad_campaigns_access" ON public.ad_campaigns;
CREATE POLICY "ad_campaigns_access" ON public.ad_campaigns
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id));

-- ad_sets
DROP POLICY IF EXISTS "ad_sets_access" ON public.ad_sets;
CREATE POLICY "ad_sets_access" ON public.ad_sets
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id));

-- ad_creatives
DROP POLICY IF EXISTS "ad_creatives_access" ON public.ad_creatives;
CREATE POLICY "ad_creatives_access" ON public.ad_creatives
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id));

-- ad_metrics_daily (writes via service; reads allowed to project members)
DROP POLICY IF EXISTS "ad_metrics_select" ON public.ad_metrics_daily;
CREATE POLICY "ad_metrics_select" ON public.ad_metrics_daily
  FOR SELECT TO authenticated
  USING (public.has_project_access(project_id, organization_id));

DROP POLICY IF EXISTS "ad_metrics_modify" ON public.ad_metrics_daily;
CREATE POLICY "ad_metrics_modify" ON public.ad_metrics_daily
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id));

-- funnel_events (reads/writes project members)
DROP POLICY IF EXISTS "funnel_events_access" ON public.funnel_events;
CREATE POLICY "funnel_events_access" ON public.funnel_events
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- attribution_keys
DROP POLICY IF EXISTS "attribution_keys_access" ON public.attribution_keys;
CREATE POLICY "attribution_keys_access" ON public.attribution_keys
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- conversion_events
DROP POLICY IF EXISTS "conversion_events_access" ON public.conversion_events;
CREATE POLICY "conversion_events_access" ON public.conversion_events
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- external_crm_accounts (admin/gestor mutate)
DROP POLICY IF EXISTS "external_crm_accounts_select" ON public.external_crm_accounts;
CREATE POLICY "external_crm_accounts_select" ON public.external_crm_accounts
  FOR SELECT TO authenticated
  USING (public.has_project_access(project_id, organization_id));

DROP POLICY IF EXISTS "external_crm_accounts_modify" ON public.external_crm_accounts;
CREATE POLICY "external_crm_accounts_modify" ON public.external_crm_accounts
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id) AND public.is_admin_or_gestor(organization_id));

-- external_crm_leads
DROP POLICY IF EXISTS "external_crm_leads_access" ON public.external_crm_leads;
CREATE POLICY "external_crm_leads_access" ON public.external_crm_leads
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));
