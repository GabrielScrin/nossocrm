-- =============================================================================
-- RBAC & Projects: add roles (admin/gestor/vendedor/cliente), project scoping,
-- default project per org, helpers, and safer RLS.
-- =============================================================================

-- 1) Normalize roles (profiles + invites)
UPDATE public.profiles
SET role = 'vendedor'
WHERE role IS NULL OR role NOT IN ('admin', 'gestor', 'vendedor', 'cliente');

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'vendedor';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'gestor', 'vendedor', 'cliente'))
  NOT VALID;

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_role_check;

UPDATE public.organization_invites
SET role = 'vendedor'
WHERE role IS NULL OR role NOT IN ('admin', 'gestor', 'vendedor', 'cliente');

ALTER TABLE public.organization_invites
  ALTER COLUMN role SET DEFAULT 'vendedor';

ALTER TABLE public.organization_invites
  DROP CONSTRAINT IF EXISTS organization_invites_role_check;

ALTER TABLE public.organization_invites
  ADD CONSTRAINT organization_invites_role_check
  CHECK (role IN ('admin', 'gestor', 'vendedor', 'cliente'))
  NOT VALID;

ALTER TABLE public.organization_invites
  VALIDATE CONSTRAINT organization_invites_role_check;

-- 2) Projects & memberships
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, name)
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_default
  ON public.projects (organization_id)
  WHERE is_default IS TRUE;

CREATE TABLE IF NOT EXISTS public.project_members (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('cliente', 'vendedor')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_members_user
  ON public.project_members (user_id);

-- 3) Helpers
CREATE OR REPLACE FUNCTION public.get_default_project_id(org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT id INTO v_project_id
  FROM public.projects
  WHERE organization_id = org_id
    AND is_default IS TRUE
  LIMIT 1;

  IF v_project_id IS NULL THEN
    INSERT INTO public.projects (organization_id, name, is_default)
    VALUES (org_id, 'Projeto padrão', TRUE)
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id INTO v_project_id;

    IF v_project_id IS NULL THEN
      SELECT id INTO v_project_id
      FROM public.projects
      WHERE organization_id = org_id
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  RETURN v_project_id;
END;
$$;

-- Ensure every existing organization has a default project
INSERT INTO public.projects (organization_id, name, is_default)
SELECT o.id, COALESCE(o.name, 'Projeto padrão'), TRUE
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.organization_id = o.id AND p.is_default IS TRUE
);

-- Backfill: vendors/clients get membership on the org default project
INSERT INTO public.project_members (project_id, user_id, organization_id, role)
SELECT
  public.get_default_project_id(p.organization_id),
  p.id,
  p.organization_id,
  CASE WHEN p.role = 'cliente' THEN 'cliente' ELSE 'vendedor' END
FROM public.profiles p
WHERE p.role IN ('vendedor', 'cliente')
  AND p.organization_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_admin_or_gestor(org_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid() AND organization_id = org_id;

  RETURN v_role IN ('admin', 'gestor');
END;
$$;

CREATE OR REPLACE FUNCTION public.has_project_access(project_id uuid, org_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR project_id IS NULL OR org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin_or_gestor(org_id) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = project_id
      AND pm.organization_id = org_id
      AND pm.user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_project_id_default()
RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    NEW.project_id := public.get_default_project_id(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_deal_project_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.board_id IS NOT NULL THEN
    SELECT project_id INTO NEW.project_id FROM public.boards WHERE id = NEW.board_id LIMIT 1;
  END IF;
  IF NEW.project_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    NEW.project_id := public.get_default_project_id(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_activity_project_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.deal_id IS NOT NULL THEN
    SELECT project_id INTO NEW.project_id FROM public.deals WHERE id = NEW.deal_id LIMIT 1;
  ELSIF NEW.contact_id IS NOT NULL THEN
    SELECT project_id INTO NEW.project_id FROM public.contacts WHERE id = NEW.contact_id LIMIT 1;
  END IF;

  IF NEW.project_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    NEW.project_id := public.get_default_project_id(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_deal_child_project_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.deal_id IS NOT NULL THEN
    SELECT project_id INTO NEW.project_id FROM public.deals WHERE id = NEW.deal_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.sync_project_member_org()
RETURNS trigger AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id
  FROM public.projects
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_members_org ON public.project_members;
CREATE TRIGGER trg_project_members_org
  BEFORE INSERT OR UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_project_member_org();

-- 4) Add project_id to domain tables (backfill + FK + triggers)
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.boards b
SET project_id = public.get_default_project_id(b.organization_id)
WHERE b.project_id IS NULL AND b.organization_id IS NOT NULL;
ALTER TABLE public.boards ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.boards
  DROP CONSTRAINT IF EXISTS boards_project_id_fkey;
ALTER TABLE public.boards
  ADD CONSTRAINT boards_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_boards_project_id ON public.boards;
CREATE TRIGGER trg_boards_project_id
  BEFORE INSERT OR UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_default();

ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.crm_companies c
SET project_id = public.get_default_project_id(c.organization_id)
WHERE c.project_id IS NULL AND c.organization_id IS NOT NULL;
ALTER TABLE public.crm_companies ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.crm_companies
  DROP CONSTRAINT IF EXISTS crm_companies_project_id_fkey;
ALTER TABLE public.crm_companies
  ADD CONSTRAINT crm_companies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_crm_companies_project_id ON public.crm_companies;
CREATE TRIGGER trg_crm_companies_project_id
  BEFORE INSERT OR UPDATE ON public.crm_companies
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_default();

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.contacts c
SET project_id = public.get_default_project_id(c.organization_id)
WHERE c.project_id IS NULL AND c.organization_id IS NOT NULL;
ALTER TABLE public.contacts ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_project_id_fkey;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_contacts_project_id ON public.contacts;
CREATE TRIGGER trg_contacts_project_id
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_default();

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.leads l
SET project_id = public.get_default_project_id(l.organization_id)
WHERE l.project_id IS NULL AND l.organization_id IS NOT NULL;
ALTER TABLE public.leads ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_project_id_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_leads_project_id ON public.leads;
CREATE TRIGGER trg_leads_project_id
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_default();

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.deals d
SET project_id = COALESCE(
  (SELECT b.project_id FROM public.boards b WHERE b.id = d.board_id LIMIT 1),
  public.get_default_project_id(d.organization_id)
)
WHERE d.project_id IS NULL AND d.organization_id IS NOT NULL;
ALTER TABLE public.deals ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_project_id_fkey;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_deals_project_id ON public.deals;
CREATE TRIGGER trg_deals_project_id
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_deal_project_id();

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.activities a
SET project_id = COALESCE(
  (SELECT d.project_id FROM public.deals d WHERE d.id = a.deal_id LIMIT 1),
  (SELECT c.project_id FROM public.contacts c WHERE c.id = a.contact_id LIMIT 1),
  public.get_default_project_id(a.organization_id)
)
WHERE a.project_id IS NULL AND a.organization_id IS NOT NULL;
ALTER TABLE public.activities ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_project_id_fkey;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_activities_project_id ON public.activities;
CREATE TRIGGER trg_activities_project_id
  BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.set_activity_project_id();

ALTER TABLE public.deal_items ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.deal_items di
SET project_id = (SELECT d.project_id FROM public.deals d WHERE d.id = di.deal_id LIMIT 1)
WHERE di.project_id IS NULL;
ALTER TABLE public.deal_items ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.deal_items
  DROP CONSTRAINT IF EXISTS deal_items_project_id_fkey;
ALTER TABLE public.deal_items
  ADD CONSTRAINT deal_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_deal_items_project_id ON public.deal_items;
CREATE TRIGGER trg_deal_items_project_id
  BEFORE INSERT OR UPDATE ON public.deal_items
  FOR EACH ROW EXECUTE FUNCTION public.set_deal_child_project_id();

ALTER TABLE public.deal_notes ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.deal_notes dn
SET project_id = (SELECT d.project_id FROM public.deals d WHERE d.id = dn.deal_id LIMIT 1)
WHERE dn.project_id IS NULL;
ALTER TABLE public.deal_notes ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.deal_notes
  DROP CONSTRAINT IF EXISTS deal_notes_project_id_fkey;
ALTER TABLE public.deal_notes
  ADD CONSTRAINT deal_notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_deal_notes_project_id ON public.deal_notes;
CREATE TRIGGER trg_deal_notes_project_id
  BEFORE INSERT OR UPDATE ON public.deal_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_deal_child_project_id();

ALTER TABLE public.deal_files ADD COLUMN IF NOT EXISTS project_id uuid;
UPDATE public.deal_files df
SET project_id = (SELECT d.project_id FROM public.deals d WHERE d.id = df.deal_id LIMIT 1)
WHERE df.project_id IS NULL;
ALTER TABLE public.deal_files ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.deal_files
  DROP CONSTRAINT IF EXISTS deal_files_project_id_fkey;
ALTER TABLE public.deal_files
  ADD CONSTRAINT deal_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
DROP TRIGGER IF EXISTS trg_deal_files_project_id ON public.deal_files;
CREATE TRIGGER trg_deal_files_project_id
  BEFORE INSERT OR UPDATE ON public.deal_files
  FOR EACH ROW EXECUTE FUNCTION public.set_deal_child_project_id();

-- 5) RLS policies (project-aware)
-- Organizations
DROP POLICY IF EXISTS "authenticated_access" ON public.organizations;
CREATE POLICY "org_members_only" ON public.organizations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = organizations.id
        AND p.role IN ('admin', 'gestor', 'vendedor', 'cliente')
    )
  )
  WITH CHECK (true);

-- Profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select_same_org" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = public.profiles.organization_id
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = public.profiles.organization_id
        AND p.role = 'admin'
    )
  );

-- Projects
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_gestor(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = projects.id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "projects_modify" ON public.projects;
CREATE POLICY "projects_modify" ON public.projects
  FOR ALL TO authenticated
  USING (public.is_admin_or_gestor(organization_id))
  WITH CHECK (public.is_admin_or_gestor(organization_id));

-- Project members
DROP POLICY IF EXISTS "project_members_select" ON public.project_members;
CREATE POLICY "project_members_select" ON public.project_members
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_gestor(organization_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "project_members_modify" ON public.project_members;
CREATE POLICY "project_members_modify" ON public.project_members
  FOR ALL TO authenticated
  USING (public.is_admin_or_gestor(organization_id))
  WITH CHECK (public.is_admin_or_gestor(organization_id));

-- Boards
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.boards;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.boards;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.boards;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.boards;
CREATE POLICY "boards_project_scope" ON public.boards
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- Board stages
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.board_stages;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.board_stages;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.board_stages;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.board_stages;
CREATE POLICY "board_stages_project_scope" ON public.board_stages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_stages.board_id
        AND public.has_project_access(b.project_id, b.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_stages.board_id
        AND public.has_project_access(b.project_id, b.organization_id)
    )
  );

-- CRM Companies
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.crm_companies;
CREATE POLICY "crm_companies_project_scope" ON public.crm_companies
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- Contacts
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.contacts;
CREATE POLICY "contacts_project_scope" ON public.contacts
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- Deals
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.deals;
CREATE POLICY "deals_project_scope" ON public.deals
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- Deal items
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.deal_items;
CREATE POLICY "deal_items_project_scope" ON public.deal_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_items.deal_id
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_items.deal_id
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  );

-- Activities
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.activities;
CREATE POLICY "activities_project_scope" ON public.activities
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- Tags (keep org-wide, block clients)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tags;
CREATE POLICY "tags_org_members" ON public.tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = tags.organization_id
        AND p.role IN ('admin', 'gestor', 'vendedor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = tags.organization_id
        AND p.role IN ('admin', 'gestor', 'vendedor')
    )
  );

-- Custom fields (org-level, exclude clientes)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.custom_field_definitions;
CREATE POLICY "custom_fields_org_members" ON public.custom_field_definitions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = custom_field_definitions.organization_id
        AND p.role IN ('admin', 'gestor', 'vendedor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = custom_field_definitions.organization_id
        AND p.role IN ('admin', 'gestor', 'vendedor')
    )
  );

-- Leads
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.leads;
CREATE POLICY "leads_project_scope" ON public.leads
  FOR ALL TO authenticated
  USING (public.has_project_access(project_id, organization_id))
  WITH CHECK (public.has_project_access(project_id, organization_id));

-- Deal notes
DROP POLICY IF EXISTS "deal_notes_access" ON public.deal_notes;
CREATE POLICY "deal_notes_project_scope" ON public.deal_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_notes.deal_id
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_notes.deal_id
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  );

-- Deal files table
DROP POLICY IF EXISTS "deal_files_access" ON public.deal_files;
CREATE POLICY "deal_files_project_scope" ON public.deal_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_files.deal_id
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_files.deal_id
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  );

-- Storage policies for deal-files bucket (align with project scope)
DROP POLICY IF EXISTS "deal_files_upload" ON storage.objects;
DROP POLICY IF EXISTS "deal_files_read" ON storage.objects;
DROP POLICY IF EXISTS "deal_files_delete" ON storage.objects;

CREATE POLICY "deal_files_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'deal-files'
    AND EXISTS (
      SELECT 1 FROM public.deal_files df
      JOIN public.deals d ON d.id = df.deal_id
      WHERE df.file_path = name
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  );

CREATE POLICY "deal_files_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'deal-files'
    AND EXISTS (
      SELECT 1 FROM public.deal_files df
      JOIN public.deals d ON d.id = df.deal_id
      WHERE df.file_path = name
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  );

CREATE POLICY "deal_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'deal-files'
    AND EXISTS (
      SELECT 1 FROM public.deal_files df
      JOIN public.deals d ON d.id = df.deal_id
      WHERE df.file_path = name
        AND public.has_project_access(d.project_id, d.organization_id)
    )
  );

-- Activities already set; next: AI tables remain unchanged.

-- 6) Update handle_new_user to auto-assign default project for vendedor/cliente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_org_id uuid;
    v_role text;
    v_project uuid;
BEGIN
    v_org_id := (new.raw_user_meta_data->>'organization_id')::uuid;
    IF v_org_id IS NULL THEN
        v_org_id := public.get_singleton_organization_id();
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma organization encontrada. Rode o setup inicial antes de criar usuários.';
    END IF;

    v_role := COALESCE(new.raw_user_meta_data->>'role', 'vendedor');

    -- Create Profile
    INSERT INTO public.profiles (id, email, name, avatar, role, organization_id)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url',
        v_role,
        v_org_id
    );

    -- Create User Settings (idempotente)
    INSERT INTO public.user_settings (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Auto-assign to default project when applicable
    IF v_role IN ('vendedor', 'cliente') THEN
      v_project := public.get_default_project_id(v_org_id);
      INSERT INTO public.project_members (project_id, user_id, organization_id, role)
      VALUES (v_project, new.id, v_org_id, CASE WHEN v_role = 'cliente' THEN 'cliente' ELSE 'vendedor' END)
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
