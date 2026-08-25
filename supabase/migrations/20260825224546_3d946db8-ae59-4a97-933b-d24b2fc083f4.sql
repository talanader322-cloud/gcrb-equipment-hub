-- =========================================================
-- GCRB Equipment Catalog - initial schema
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.normalize_code(input TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(UPPER(REGEXP_REPLACE(COALESCE(input,''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION public.normalize_text(input TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(UPPER(TRIM(REGEXP_REPLACE(COALESCE(input,''), '\s+', ' ', 'g'))), '')
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- roles ----------
CREATE TYPE public.app_role AS ENUM ('system_admin','catalog_manager','technical_user','viewer');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  job_title TEXT,
  department TEXT,
  locale TEXT NOT NULL DEFAULT 'ar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_catalog(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('system_admin','catalog_manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email,''),'@',1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO first_user;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN first_user THEN 'system_admin'::public.app_role ELSE 'technical_user'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "roles readable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'system_admin')) WITH CHECK (public.has_role(auth.uid(),'system_admin'));
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- ---------- catalog domain ----------
CREATE TABLE public.manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  official_website TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.equipment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.machine_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID NOT NULL REFERENCES public.manufacturers(id) ON DELETE RESTRICT,
  equipment_type_id UUID REFERENCES public.equipment_types(id) ON DELETE SET NULL,
  model_name TEXT NOT NULL,
  normalized_model_name TEXT GENERATED ALWAYS AS (public.normalize_code(model_name)) STORED,
  series TEXT,
  description TEXT,
  image_url TEXT,
  production_from INT,
  production_to INT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manufacturer_id, model_name)
);

CREATE TABLE public.machine_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_model_id UUID NOT NULL REFERENCES public.machine_models(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT GENERATED ALWAYS AS (public.normalize_code(alias)) STORED,
  UNIQUE (machine_model_id, alias)
);

CREATE TABLE public.serial_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_model_id UUID NOT NULL REFERENCES public.machine_models(id) ON DELETE CASCADE,
  serial_prefix TEXT,
  serial_from TEXT,
  serial_to TEXT,
  display_value TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.external_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'api',
  base_url TEXT,
  connector_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  priority INT NOT NULL DEFAULT 100,
  requires_authentication BOOLEAN NOT NULL DEFAULT false,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID NOT NULL REFERENCES public.manufacturers(id) ON DELETE RESTRICT,
  machine_model_id UUID REFERENCES public.machine_models(id) ON DELETE SET NULL,
  catalog_number TEXT,
  normalized_catalog_number TEXT GENERATED ALWAYS AS (public.normalize_code(catalog_number)) STORED,
  title TEXT NOT NULL,
  normalized_title TEXT GENERATED ALWAYS AS (public.normalize_text(title)) STORED,
  catalog_type TEXT NOT NULL DEFAULT 'parts_catalog',
  language TEXT NOT NULL DEFAULT 'en',
  revision TEXT,
  publication_date DATE,
  serial_from TEXT,
  serial_to TEXT,
  source_id UUID REFERENCES public.external_sources(id) ON DELETE SET NULL,
  external_source_reference TEXT,
  file_id UUID,
  page_count INT,
  searchable BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.catalog_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  storage_provider TEXT NOT NULL DEFAULT 'supabase',
  storage_bucket TEXT NOT NULL DEFAULT 'catalogs',
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  file_size BIGINT,
  checksum TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.catalogs
  ADD CONSTRAINT catalogs_file_fk FOREIGN KEY (file_id) REFERENCES public.catalog_files(id) ON DELETE SET NULL;

CREATE TABLE public.catalog_machine_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  machine_model_id UUID NOT NULL REFERENCES public.machine_models(id) ON DELETE CASCADE,
  serial_range_id UUID REFERENCES public.serial_ranges(id) ON DELETE SET NULL,
  UNIQUE (catalog_id, machine_model_id, serial_range_id)
);

CREATE TABLE public.catalog_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  parent_section_id UUID REFERENCES public.catalog_sections(id) ON DELETE CASCADE,
  section_number TEXT,
  title TEXT NOT NULL,
  normalized_title TEXT GENERATED ALWAYS AS (public.normalize_text(title)) STORED,
  sort_order INT NOT NULL DEFAULT 0,
  page_from INT,
  page_to INT
);

CREATE TABLE public.assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.catalog_sections(id) ON DELETE SET NULL,
  assembly_number TEXT,
  title TEXT NOT NULL,
  normalized_title TEXT GENERATED ALWAYS AS (public.normalize_text(title)) STORED,
  diagram_id UUID,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.diagrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  assembly_id UUID REFERENCES public.assemblies(id) ON DELETE CASCADE,
  title TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  page_number INT,
  width INT,
  height INT
);
ALTER TABLE public.assemblies
  ADD CONSTRAINT assemblies_diagram_fk FOREIGN KEY (diagram_id) REFERENCES public.diagrams(id) ON DELETE SET NULL;

CREATE TABLE public.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID NOT NULL REFERENCES public.manufacturers(id) ON DELETE RESTRICT,
  primary_part_number TEXT NOT NULL,
  normalized_part_number TEXT GENERATED ALWAYS AS (public.normalize_code(primary_part_number)) STORED,
  description TEXT,
  normalized_description TEXT GENERATED ALWAYS AS (public.normalize_text(description)) STORED,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manufacturer_id, primary_part_number)
);

CREATE TABLE public.part_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  alternate_number TEXT NOT NULL,
  normalized_number TEXT GENERATED ALWAYS AS (public.normalize_code(alternate_number)) STORED,
  alias_type TEXT NOT NULL DEFAULT 'alternate',
  UNIQUE (part_id, alternate_number)
);

CREATE TABLE public.assembly_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  position_number TEXT,
  quantity INT,
  notes TEXT,
  superseded_by_part_id UUID REFERENCES public.parts(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE public.diagram_hotspots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id UUID NOT NULL REFERENCES public.diagrams(id) ON DELETE CASCADE,
  assembly_part_id UUID NOT NULL REFERENCES public.assembly_parts(id) ON DELETE CASCADE,
  position_number TEXT,
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  width NUMERIC NOT NULL DEFAULT 0,
  height NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE public.part_machine_compatibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  machine_model_id UUID NOT NULL REFERENCES public.machine_models(id) ON DELETE CASCADE,
  serial_range_id UUID REFERENCES public.serial_ranges(id) ON DELETE SET NULL,
  notes TEXT,
  UNIQUE (part_id, machine_model_id, serial_range_id)
);

-- ---------- online discovery / import ----------
CREATE TABLE public.external_search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.external_sources(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result_type TEXT NOT NULL DEFAULT 'catalog',
  external_id TEXT NOT NULL,
  title TEXT,
  manufacturer TEXT,
  model TEXT,
  part_number TEXT,
  description TEXT,
  catalog_type TEXT,
  external_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.external_sources(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  import_type TEXT NOT NULL DEFAULT 'online_result',
  status TEXT NOT NULL DEFAULT 'pending',
  total_records INT NOT NULL DEFAULT 0,
  imported_records INT NOT NULL DEFAULT 0,
  skipped_records INT NOT NULL DEFAULT 0,
  failed_records INT NOT NULL DEFAULT 0,
  error_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.import_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  external_reference TEXT,
  entity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  local_entity_id UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- personal ----------
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);

CREATE TABLE public.recent_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);

CREATE TABLE public.saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.download_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  catalog_id UUID NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INT NOT NULL DEFAULT 0,
  local_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- grants + RLS ----------
DO $$
DECLARE t TEXT;
  catalog_tables TEXT[] := ARRAY['manufacturers','equipment_types','machine_models','machine_aliases','serial_ranges',
    'catalogs','catalog_files','catalog_machine_relations','catalog_sections','assemblies','diagrams',
    'diagram_hotspots','parts','part_aliases','assembly_parts','part_machine_compatibility'];
  own_tables TEXT[] := ARRAY['favorites','recent_items','saved_searches','download_records'];
BEGIN
  FOREACH t IN ARRAY catalog_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "read for authenticated" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "managers write" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_catalog(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "managers update" ON public.%I FOR UPDATE TO authenticated USING (public.can_manage_catalog(auth.uid())) WITH CHECK (public.can_manage_catalog(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "admins delete" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''system_admin''))', t);
    EXECUTE format('CREATE TRIGGER set_updated_at_%s BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;

  FOREACH t IN ARRAY own_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "own rows" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
END $$;

-- tables above without updated_at column: drop those triggers
DROP TRIGGER IF EXISTS set_updated_at_machine_aliases ON public.machine_aliases;
DROP TRIGGER IF EXISTS set_updated_at_serial_ranges ON public.serial_ranges;
DROP TRIGGER IF EXISTS set_updated_at_catalog_files ON public.catalog_files;
DROP TRIGGER IF EXISTS set_updated_at_catalog_machine_relations ON public.catalog_machine_relations;
DROP TRIGGER IF EXISTS set_updated_at_catalog_sections ON public.catalog_sections;
DROP TRIGGER IF EXISTS set_updated_at_assemblies ON public.assemblies;
DROP TRIGGER IF EXISTS set_updated_at_diagrams ON public.diagrams;
DROP TRIGGER IF EXISTS set_updated_at_diagram_hotspots ON public.diagram_hotspots;
DROP TRIGGER IF EXISTS set_updated_at_part_aliases ON public.part_aliases;
DROP TRIGGER IF EXISTS set_updated_at_assembly_parts ON public.assembly_parts;
DROP TRIGGER IF EXISTS set_updated_at_part_machine_compatibility ON public.part_machine_compatibility;

CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_download_records BEFORE UPDATE ON public.download_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- external sources (managers only for write, readable to authenticated)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_sources TO authenticated;
GRANT ALL ON public.external_sources TO service_role;
ALTER TABLE public.external_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources readable" ON public.external_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage sources" ON public.external_sources FOR ALL TO authenticated
  USING (public.can_manage_catalog(auth.uid())) WITH CHECK (public.can_manage_catalog(auth.uid()));
CREATE TRIGGER set_updated_at_external_sources BEFORE UPDATE ON public.external_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_search_results TO authenticated;
GRANT ALL ON public.external_search_results TO service_role;
ALTER TABLE public.external_search_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "temp results readable" ON public.external_search_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "temp results writable" ON public.external_search_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "temp results deletable" ON public.external_search_results FOR DELETE TO authenticated USING (public.can_manage_catalog(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import jobs readable" ON public.import_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers create import jobs" ON public.import_jobs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_manage_catalog(auth.uid()));
CREATE POLICY "managers update import jobs" ON public.import_jobs FOR UPDATE TO authenticated
  USING (public.can_manage_catalog(auth.uid())) WITH CHECK (public.can_manage_catalog(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.import_job_items TO authenticated;
GRANT ALL ON public.import_job_items TO service_role;
ALTER TABLE public.import_job_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import items readable" ON public.import_job_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers write import items" ON public.import_job_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalog(auth.uid()));
CREATE POLICY "managers update import items" ON public.import_job_items FOR UPDATE TO authenticated
  USING (public.can_manage_catalog(auth.uid())) WITH CHECK (public.can_manage_catalog(auth.uid()));

-- ---------- indexes ----------
CREATE INDEX idx_models_norm ON public.machine_models (normalized_model_name);
CREATE INDEX idx_models_norm_trgm ON public.machine_models USING gin (normalized_model_name gin_trgm_ops);
CREATE INDEX idx_models_manufacturer ON public.machine_models (manufacturer_id);
CREATE INDEX idx_models_type ON public.machine_models (equipment_type_id);
CREATE INDEX idx_aliases_norm ON public.machine_aliases (normalized_alias);
CREATE INDEX idx_serial_prefix ON public.serial_ranges (serial_prefix);
CREATE INDEX idx_serial_model ON public.serial_ranges (machine_model_id);
CREATE INDEX idx_serial_from_to ON public.serial_ranges (serial_from, serial_to);
CREATE INDEX idx_catalogs_number ON public.catalogs (normalized_catalog_number);
CREATE INDEX idx_catalogs_title_trgm ON public.catalogs USING gin (normalized_title gin_trgm_ops);
CREATE INDEX idx_catalogs_model ON public.catalogs (machine_model_id);
CREATE INDEX idx_catalogs_manufacturer ON public.catalogs (manufacturer_id);
CREATE INDEX idx_catalogs_type ON public.catalogs (catalog_type);
CREATE INDEX idx_parts_norm ON public.parts (normalized_part_number);
CREATE INDEX idx_parts_norm_trgm ON public.parts USING gin (normalized_part_number gin_trgm_ops);
CREATE INDEX idx_parts_desc_trgm ON public.parts USING gin (normalized_description gin_trgm_ops);
CREATE INDEX idx_parts_desc_fts ON public.parts USING gin (to_tsvector('simple', coalesce(description,'')));
CREATE INDEX idx_parts_manufacturer ON public.parts (manufacturer_id);
CREATE INDEX idx_part_aliases_norm ON public.part_aliases (normalized_number);
CREATE INDEX idx_assemblies_catalog ON public.assemblies (catalog_id);
CREATE INDEX idx_assemblies_title_trgm ON public.assemblies USING gin (normalized_title gin_trgm_ops);
CREATE INDEX idx_assembly_parts_assembly ON public.assembly_parts (assembly_id);
CREATE INDEX idx_assembly_parts_part ON public.assembly_parts (part_id);
CREATE INDEX idx_compat_part ON public.part_machine_compatibility (part_id);
CREATE INDEX idx_compat_model ON public.part_machine_compatibility (machine_model_id);
CREATE INDEX idx_sections_catalog ON public.catalog_sections (catalog_id);
CREATE INDEX idx_recent_user ON public.recent_items (user_id, opened_at DESC);
CREATE INDEX idx_fav_user ON public.favorites (user_id, created_at DESC);
CREATE INDEX idx_ext_results_query ON public.external_search_results (query);

-- ---------- seed data ----------
INSERT INTO public.manufacturers (name, short_name, slug, official_website) VALUES
  ('Caterpillar','CAT','caterpillar','https://www.caterpillar.com'),
  ('Komatsu','Komatsu','komatsu','https://www.komatsu.com'),
  ('Volvo Construction Equipment','Volvo CE','volvo-ce','https://www.volvoce.com'),
  ('Hitachi Construction Machinery','Hitachi','hitachi','https://www.hitachicm.com'),
  ('Hyundai Construction Equipment','Hyundai','hyundai','https://www.hyundai-ce.com'),
  ('Develon / Doosan','Develon','develon','https://www.develon-ce.com'),
  ('Kobelco','Kobelco','kobelco','https://www.kobelco-construction.com'),
  ('JCB','JCB','jcb','https://www.jcb.com'),
  ('CASE Construction','CASE','case-construction','https://www.casece.com'),
  ('Liebherr','Liebherr','liebherr','https://www.liebherr.com'),
  ('SANY','SANY','sany','https://www.sanyglobal.com'),
  ('XCMG','XCMG','xcmg','https://www.xcmg.com');

INSERT INTO public.equipment_types (name, name_ar, slug, icon) VALUES
  ('Excavator','حفارة','excavator','Shovel'),
  ('Mini Excavator','حفارة صغيرة','mini-excavator','Shovel'),
  ('Bulldozer','جرافة','bulldozer','Tractor'),
  ('Wheel Loader','لودر بعجلات','wheel-loader','Truck'),
  ('Backhoe Loader','لودر حفار','backhoe-loader','Truck'),
  ('Motor Grader','ممهدة (غريدر)','motor-grader','Ruler'),
  ('Dump Truck','قلاب','dump-truck','Truck'),
  ('Articulated Dump Truck','قلاب مفصلي','articulated-dump-truck','Truck'),
  ('Mining Truck','شاحنة مناجم','mining-truck','Truck'),
  ('Pipelayer','رافعة أنابيب','pipelayer','Wrench'),
  ('Skid Steer','لودر انزلاقي','skid-steer','Truck'),
  ('Compact Track Loader','لودر مجنزر مدمج','compact-track-loader','Truck'),
  ('Compactor','مدحلة ضاغطة','compactor','CircleDot'),
  ('Road Roller','مدحلة طرق','road-roller','CircleDot'),
  ('Asphalt Paver','فرادة أسفلت','asphalt-paver','Layers'),
  ('Cold Planer','كاشطة أسفلت','cold-planer','Layers'),
  ('Crane','رافعة','crane','Crane'),
  ('Drilling Equipment','معدات حفر آبار','drilling-equipment','Drill'),
  ('Heavy Equipment Engine','محرك معدات ثقيلة','heavy-equipment-engine','Cog');

INSERT INTO public.machine_models (manufacturer_id, equipment_type_id, model_name, series, description)
SELECT m.id, e.id, 'GD511A-1', 'GD511', 'Komatsu motor grader used in road construction and maintenance.'
FROM public.manufacturers m, public.equipment_types e
WHERE m.slug = 'komatsu' AND e.slug = 'motor-grader';

INSERT INTO public.machine_aliases (machine_model_id, alias)
SELECT id, 'GD511A1' FROM public.machine_models WHERE model_name = 'GD511A-1';

INSERT INTO public.serial_ranges (machine_model_id, serial_prefix, serial_from, serial_to, display_value, notes)
SELECT id, 'GD511', '10001', NULL, '10001-UP', 'Serial numbers 10001 and above.'
FROM public.machine_models WHERE model_name = 'GD511A-1';

INSERT INTO public.catalogs (manufacturer_id, machine_model_id, catalog_number, title, catalog_type, language, revision, serial_from, serial_to, page_count)
SELECT m.id, mm.id, 'SEBP-GD511A-1', 'KOMATSU GD511A-1 Parts Catalog', 'parts_catalog', 'en', 'Rev. 01', '10001', NULL, 420
FROM public.manufacturers m JOIN public.machine_models mm ON mm.manufacturer_id = m.id
WHERE m.slug = 'komatsu' AND mm.model_name = 'GD511A-1';

INSERT INTO public.catalog_machine_relations (catalog_id, machine_model_id, serial_range_id)
SELECT c.id, mm.id, sr.id FROM public.catalogs c
JOIN public.machine_models mm ON mm.id = c.machine_model_id
JOIN public.serial_ranges sr ON sr.machine_model_id = mm.id
WHERE c.catalog_number = 'SEBP-GD511A-1';

INSERT INTO public.catalog_sections (catalog_id, section_number, title, sort_order, page_from, page_to)
SELECT id, '15', 'POWER TRAIN', 1, 120, 190 FROM public.catalogs WHERE catalog_number = 'SEBP-GD511A-1';

INSERT INTO public.assemblies (catalog_id, section_id, assembly_number, title, sort_order)
SELECT c.id, s.id, '15-01', 'TRANSMISSION GROUP', 1
FROM public.catalogs c JOIN public.catalog_sections s ON s.catalog_id = c.id
WHERE c.catalog_number = 'SEBP-GD511A-1';

INSERT INTO public.parts (manufacturer_id, primary_part_number, description, notes)
SELECT id, '23A-15-00053', 'TRANSMISSION ASS''Y', 'Demo seed record for validation of catalog search.'
FROM public.manufacturers WHERE slug = 'komatsu';

INSERT INTO public.part_aliases (part_id, alternate_number, alias_type)
SELECT id, '23A1500053', 'normalized' FROM public.parts WHERE primary_part_number = '23A-15-00053';

INSERT INTO public.assembly_parts (assembly_id, part_id, position_number, quantity, sort_order)
SELECT a.id, p.id, '1', 1, 1 FROM public.assemblies a, public.parts p
WHERE a.assembly_number = '15-01' AND p.primary_part_number = '23A-15-00053';

INSERT INTO public.part_machine_compatibility (part_id, machine_model_id, serial_range_id, notes)
SELECT p.id, mm.id, sr.id, 'Applies to serial 10001-UP.'
FROM public.parts p, public.machine_models mm JOIN public.serial_ranges sr ON sr.machine_model_id = mm.id
WHERE p.primary_part_number = '23A-15-00053' AND mm.model_name = 'GD511A-1';

INSERT INTO public.external_sources (name, slug, source_type, base_url, connector_key, enabled, priority, requires_authentication, configuration)
VALUES ('DEMO Catalog Source (validation only)','demo-catalog-source','demo',NULL,'demo',true,10,false,
  '{"note":"Built-in demo connector. Generates clearly labelled synthetic results to validate online search, preview and import. Not a real external data source."}'::jsonb);
