-- Phase 2: configurable catalog sources + machine assets & manual packages
-- Idempotent: safe to re-run, preserves existing production data.

ALTER TABLE public.external_sources
  ADD COLUMN IF NOT EXISTS allows_download boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS search_url_template text,
  ADD COLUMN IF NOT EXISTS manufacturer_scope text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE public.external_sources SET enabled = false WHERE connector_key = 'demo';

INSERT INTO public.external_sources
  (name, slug, source_type, connector_key, base_url, enabled, priority, requires_authentication, allows_download, search_url_template, manufacturer_scope, notes)
VALUES
  ('TehCat', 'tehcat', 'public_catalog', 'link_template', 'https://en.tehcat.ru/catalog/', true, 20, false, false, 'https://en.tehcat.ru/catalog/?search={query}', '{}', 'Approved heavy-equipment reference. Managed link-out only; no download, no protection bypass.'),
  ('777parts', '777parts', 'public_catalog', 'link_template', 'https://777parts.com/', true, 30, false, false, 'https://777parts.com/search/?q={query}', '{}', 'Approved heavy-equipment reference. Managed link-out only; no download, no protection bypass.'),
  ('AVRORA PARTS', 'avrora-parts', 'public_catalog', 'link_template', NULL, false, 40, false, false, NULL, '{}', 'Disabled until a Catalog Manager configures a current verified URL.'),
  ('K-Part', 'k-part', 'public_catalog', 'k_part_public', 'https://k-part.com/', true, 25, false, false, 'https://k-part.com/search?q={query}', '{}', 'Public metadata only. No subscription, login, CAPTCHA or anti-bot bypass.')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  connector_key = EXCLUDED.connector_key,
  base_url = COALESCE(EXCLUDED.base_url, public.external_sources.base_url),
  enabled = EXCLUDED.enabled,
  priority = EXCLUDED.priority,
  allows_download = EXCLUDED.allows_download,
  search_url_template = COALESCE(EXCLUDED.search_url_template, public.external_sources.search_url_template),
  notes = EXCLUDED.notes,
  updated_at = now();

-- machine_assets ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.machine_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_model_id uuid REFERENCES public.machine_models(id) ON DELETE SET NULL,
  serial_number text NOT NULL,
  asset_number text,
  manufacture_year integer,
  branch text,
  project text,
  purchase_reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS machine_assets_model_idx ON public.machine_assets (machine_model_id);
CREATE INDEX IF NOT EXISTS machine_assets_serial_idx ON public.machine_assets (serial_number);
CREATE UNIQUE INDEX IF NOT EXISTS machine_assets_asset_number_key
  ON public.machine_assets (asset_number) WHERE asset_number IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_assets TO authenticated;
GRANT ALL ON public.machine_assets TO service_role;
ALTER TABLE public.machine_assets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at_machine_assets ON public.machine_assets;
CREATE TRIGGER set_updated_at_machine_assets
  BEFORE UPDATE ON public.machine_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "machine_assets_read" ON public.machine_assets;
CREATE POLICY "machine_assets_read" ON public.machine_assets
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "machine_assets_insert" ON public.machine_assets;
CREATE POLICY "machine_assets_insert" ON public.machine_assets
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_catalog(auth.uid()));
DROP POLICY IF EXISTS "machine_assets_update" ON public.machine_assets;
CREATE POLICY "machine_assets_update" ON public.machine_assets
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));
DROP POLICY IF EXISTS "machine_assets_delete" ON public.machine_assets;
CREATE POLICY "machine_assets_delete" ON public.machine_assets
  FOR DELETE TO authenticated USING (public.can_manage_catalog(auth.uid()));

-- asset_manuals ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asset_manuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_asset_id uuid NOT NULL REFERENCES public.machine_assets(id) ON DELETE CASCADE,
  catalog_id uuid REFERENCES public.catalogs(id) ON DELETE SET NULL,
  manual_type text,
  title text,
  original_filename text,
  storage_path text UNIQUE,
  file_size bigint,
  checksum text,
  language text,
  revision text,
  serial_from text,
  serial_to text,
  source_type text NOT NULL DEFAULT 'original_equipment_manual',
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_manuals_asset_idx ON public.asset_manuals (machine_asset_id);
CREATE INDEX IF NOT EXISTS asset_manuals_checksum_idx
  ON public.asset_manuals (checksum) WHERE checksum IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_manuals TO authenticated;
GRANT ALL ON public.asset_manuals TO service_role;
ALTER TABLE public.asset_manuals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_manuals_read" ON public.asset_manuals;
CREATE POLICY "asset_manuals_read" ON public.asset_manuals
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "asset_manuals_insert" ON public.asset_manuals;
CREATE POLICY "asset_manuals_insert" ON public.asset_manuals
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_catalog(auth.uid()));
DROP POLICY IF EXISTS "asset_manuals_update" ON public.asset_manuals;
CREATE POLICY "asset_manuals_update" ON public.asset_manuals
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalog(auth.uid()))
  WITH CHECK (public.can_manage_catalog(auth.uid()));
DROP POLICY IF EXISTS "asset_manuals_delete" ON public.asset_manuals;
CREATE POLICY "asset_manuals_delete" ON public.asset_manuals
  FOR DELETE TO authenticated USING (public.can_manage_catalog(auth.uid()));