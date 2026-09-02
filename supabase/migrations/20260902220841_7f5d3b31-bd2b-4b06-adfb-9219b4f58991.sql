BEGIN;

DO $stage0$
DECLARE
  v_komatsu uuid;
BEGIN
  SELECT id INTO v_komatsu FROM public.manufacturers WHERE slug = 'komatsu' LIMIT 1;
  IF v_komatsu IS NULL THEN
    RAISE EXCEPTION 'Komatsu manufacturer is required before stage 0.' USING ERRCODE = '22023';
  END IF;

  -- Keep only the three verified Komatsu books and everything attached to them.
  DELETE FROM public.catalogs
  WHERE manufacturer_id = v_komatsu
    AND NOT (
      catalog_number IN ('777parts-1', '777parts-2', '777parts-3')
      OR title ILIKE 'PC 1400-1%'
      OR title ILIKE 'PC228US-3-YB%'
      OR title ILIKE 'PC350-7%'
    );
  DELETE FROM public.catalogs
  WHERE manufacturer_id <> v_komatsu;

  -- Remove all prior model/part demo data after the retained books are safe.
  DELETE FROM public.machine_query_log;
  DELETE FROM public.part_alternates;
  DELETE FROM public.part_aliases;
  DELETE FROM public.part_machine_compatibility;
  DELETE FROM public.assembly_parts;
  DELETE FROM public.parts;
  DELETE FROM public.machine_models;

  -- Remove temporary/demo source records and any dependent temporary results.
  DELETE FROM public.external_sources
  WHERE slug = 'demo'
     OR lower(name) LIKE 'demo%';

  -- Remove orphaned legacy equipment categories; the stage 0 seed below recreates the approved set.
  DELETE FROM public.equipment_types
  WHERE NOT EXISTS (
    SELECT 1 FROM public.machine_models mm WHERE mm.equipment_type_id = public.equipment_types.id
  );

  -- Remove every manufacturer except Komatsu after its dependent records are gone.
  DELETE FROM public.manufacturers WHERE id <> v_komatsu;
END
$stage0$;

INSERT INTO public.equipment_types (name, name_ar, slug, icon, active)
VALUES
  ('Bulldozer', 'حراثة / بلدوزر', 'bulldozer', 'tractor', true),
  ('Motor Grader', 'جريدر', 'motor-grader', 'road', true),
  ('Wheel Loader', 'غرافة / لودر', 'wheel-loader', 'loader', true),
  ('Excavator', 'بوكلين', 'excavator', 'construction', true),
  ('Road Roller', 'دكاكة', 'road-roller', 'circle', true),
  ('Generator Set', 'مولدات كهرباء', 'generator-set', 'zap', true),
  ('Air Compressor', 'كمبريسر هواء', 'air-compressor', 'wind', true),
  ('Dozer Attachments', 'ملحقات وبومات الجرافات', 'dozer-attachment', 'wrench', true),
  ('Heavy Equipment Engine', 'محركات وتوابع المعدات', 'heavy-equipment-engine', 'cog', true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    name_ar = EXCLUDED.name_ar,
    icon = EXCLUDED.icon,
    active = true,
    updated_at = now();

WITH komatsu AS (
  SELECT id FROM public.manufacturers WHERE slug = 'komatsu' LIMIT 1
), seed(model_name, type_slug) AS (
  VALUES
    ('WA300-1', 'wheel-loader'),
    ('D65A-8', 'bulldozer'),
    ('GD705-R2', 'motor-grader'),
    ('DRP080-4', 'dozer-attachment'),
    ('EC50Z-5', 'air-compressor'),
    ('D275A-2', 'bulldozer'),
    ('D155A-3', 'bulldozer'),
    ('D85-18', 'bulldozer'),
    ('D85-21', 'bulldozer'),
    ('GD661-A1', 'motor-grader'),
    ('GD605A-2', 'motor-grader'),
    ('WA470-3', 'wheel-loader'),
    ('D155A-2', 'bulldozer'),
    ('EG630B-3', 'generator-set'),
    ('EG570B-3', 'generator-set'),
    ('EG5570B-3', 'generator-set'),
    ('GD500R-1', 'motor-grader'),
    ('D65E-7', 'bulldozer'),
    ('EG220-1', 'generator-set'),
    ('D50A-16', 'bulldozer'),
    ('DRP150-1,2', 'dozer-attachment'),
    ('D50A-17', 'bulldozer'),
    ('S6D105-1', 'heavy-equipment-engine'),
    ('WA320-1', 'wheel-loader'),
    ('WA180-1', 'wheel-loader'),
    ('D75S-5', 'bulldozer'),
    ('GD705A-4', 'motor-grader'),
    ('PC220-7', 'excavator'),
    ('D155A-1', 'bulldozer'),
    ('EG2102-1', 'generator-set'),
    ('DRP060-4', 'dozer-attachment'),
    ('WA400-1', 'wheel-loader'),
    ('EG125-2', 'generator-set'),
    ('EG100-10052', 'generator-set'),
    ('W90-3', 'wheel-loader'),
    ('WA420-1', 'wheel-loader'),
    ('W90-2', 'wheel-loader'),
    ('EC1052-1', 'air-compressor'),
    ('GD511A', 'motor-grader'),
    ('JV100A-1', 'road-roller'),
    ('DRP50-3', 'dozer-attachment'),
    ('DRP050-24', 'dozer-attachment'),
    ('SA6D125-1', 'generator-set'),
    ('D60E-7', 'bulldozer'),
    ('NH-220-C1', 'heavy-equipment-engine')
)
INSERT INTO public.machine_models (
  manufacturer_id, equipment_type_id, model_name, series, description, active
)
SELECT
  k.id,
  et.id,
  s.model_name,
  split_part(s.model_name, '-', 1),
  'Equipment model from the GCRB Komatsu inventory workbook.',
  true
FROM komatsu k
CROSS JOIN seed s
JOIN public.equipment_types et ON et.slug = s.type_slug
ON CONFLICT (manufacturer_id, model_name) DO UPDATE
SET equipment_type_id = EXCLUDED.equipment_type_id,
    series = EXCLUDED.series,
    description = EXCLUDED.description,
    active = true,
    updated_at = now();

WITH komatsu_model(model_name, alias) AS (
  VALUES
    ('DRP150-1,2', 'D155-1'),
    ('EG630B-3', 'SA6D140-1'),
    ('DRP060-4', 'D65A-7'),
    ('DRP50-3', 'D50-17'),
    ('DRP050-24', 'D50-16'),
    ('SA6D125-1', 'EG300B-3')
)
INSERT INTO public.machine_aliases (machine_model_id, alias)
SELECT mm.id, k.alias
FROM komatsu_model k
JOIN public.machine_models mm
  ON mm.model_name = k.model_name
JOIN public.manufacturers m
  ON m.id = mm.manufacturer_id AND m.slug = 'komatsu'
ON CONFLICT (machine_model_id, alias) DO NOTHING;

COMMIT;