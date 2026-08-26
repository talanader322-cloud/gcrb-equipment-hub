-- Phase 2: configurable catalog sources + institution-owned equipment/manual packages

ALTER TABLE public.external_sources
  ADD COLUMN IF NOT EXISTS allows_download boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS search_url_template text,
  ADD COLUMN IF NOT EXISTS manufacturer_scope text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes text;

-- Demo must never be enabled for production discovery.
UPDATE public.external_sources SET enabled = false WHERE connector_key = 'demo';

-- Seed the source registry without pretending generic scraping is implemented.
INSERT INTO public.external_sources
  (name, slug, source_type, connector_key, base_url, enabled, priority,
   requires_authentication, configuration, allows_download, search_url_template,
   manufacturer_scope, notes)
VALUES
  ('TehCat', 'tehcat', 'catalog_website', 'link_template', 'https://en.tehcat.ru/catalog/', true, 10,
   false, '{"mode":"managed_link"}'::jsonb, false, NULL,
   ARRAY['Komatsu','Caterpillar','Volvo CE','Hitachi','Hyundai','Doosan','Develon','Kobelco','JCB','CASE','Liebherr','SANY','XCMG'],
   'Approved heavy-equipment catalog source. Dedicated connector may be added when a stable permitted interface is available.'),
  ('777parts', '777parts', 'catalog_website', 'link_template', 'https://777parts.com/', true, 20,
   false, '{"mode":"managed_link"}'::jsonb, false, NULL,
   ARRAY['Komatsu'], 'Heavy-equipment parts diagrams/catalog source.'),
  ('AVRORA PARTS', 'avrora-parts', 'catalog_website', 'link_template', NULL, false, 30,
   false, '{"mode":"managed_link"}'::jsonb, false, NULL,
   ARRAY['Komatsu','Caterpillar'], 'Set the current verified AVRORA PARTS URL in Catalog Sources before enabling.'),
  ('K-Part', 'k-part', 'catalog_website', 'link_template', 'https://k-part.com/', true, 40,
   true, '{"mode":"managed_link"}'::jsonb, false, NULL,
   ARRAY['Komatsu'], 'May require subscription/login; never bypass access controls.')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = COALESCE(public.external_sources.base_url, EXCLUDED.base_url),
  manufacturer_scope = EXCLUDED.manufacturer_scope,
  notes = COALESCE(public.external_sources.notes, EXCLUDED.notes);

CREATE TABLE IF NOT EXISTS public.machine_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_model_id uuid NOT NULL REFERENCES public.machine_models(id) ON DELETE RESTRICT,
  serial_number text NOT NULL,
  asset_number text,
  manufacture_year integer,
  branch text,
  project text,
  purchase_reference text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_assets_asset_number
  ON public.machine_assets(asset_number) WHERE asset_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_machine_assets_model ON public.machine_assets(machine_model_id);
CREATE INDEX IF NOT EXISTS ix_machine_assets_serial ON public.machine_assets(serial_number);

CREATE TABLE IF NOT EXISTS public.asset_manuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_asset_id uuid NOT NULL REFERENCES public.machine_assets(id) ON DELETE CASCADE,
  catalog_id uuid REFERENCES public.catalogs(id) ON DELETE SET NULL,
  manual_type text NOT NULL,
  title text NOT NULL,
  original_filename text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_size bigint,
  checksum text,
  language text NOT NULL DEFAULT 'en',
  revision text,
  serial_from text,
  serial_to text,
  source_type text NOT NULL DEFAULT 'original_equipment_manual',
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_asset_manuals_asset ON public.asset_manuals(machine_asset_id);
CREATE INDEX IF NOT EXISTS ix_asset_manuals_checksum ON public.asset_manuals(checksum) WHERE checksum IS NOT NULL;

ALTER TABLE public.machine_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_manuals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "machine assets authenticated read" ON public.machine_assets;
CREATE POLICY "machine assets authenticated read" ON public.machine_assets
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "machine assets managers write" ON public.machine_assets;
CREATE POLICY "machine assets managers write" ON public.machine_assets
FOR ALL TO authenticated USING (public.can_manage_catalog(auth.uid()))
WITH CHECK (public.can_manage_catalog(auth.uid()));

DROP POLICY IF EXISTS "asset manuals authenticated read" ON public.asset_manuals;
CREATE POLICY "asset manuals authenticated read" ON public.asset_manuals
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "asset manuals managers write" ON public.asset_manuals;
CREATE POLICY "asset manuals managers write" ON public.asset_manuals
FOR ALL TO authenticated USING (public.can_manage_catalog(auth.uid()))
WITH CHECK (public.can_manage_catalog(auth.uid()));

-- Existing source manager policy remains authoritative. Add manager-only field checks through RLS.
