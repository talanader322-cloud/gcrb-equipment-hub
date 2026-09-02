BEGIN;

DELETE FROM public.catalogs
WHERE title ILIKE 'Demo%'
   OR catalog_number ILIKE 'demo%';

DELETE FROM public.external_sources
WHERE connector_key = 'demo'
   OR slug = 'demo';

INSERT INTO public.external_sources (
  name,
  slug,
  source_type,
  base_url,
  connector_key,
  enabled,
  priority,
  requires_authentication,
  configuration,
  allows_download,
  manufacturer_scope,
  notes
)
VALUES (
  'Mega — Komatsu CSS/LinkOne (manual archive)',
  'mega-komatsu-css-linkone',
  'pdf_source',
  NULL,
  'pdf_source',
  TRUE,
  5,
  TRUE,
  jsonb_build_object(
    'mode', 'manual_archive',
    'searchable_online', false,
    'requires_exported_pdf', true,
    'manufacturer_scope', jsonb_build_array('Komatsu')
  ),
  FALSE,
  ARRAY['Komatsu'],
  'Institution-owned CSS/LinkOne archive. Staff must export or print a catalog to PDF on Windows, then upload it through the catalog archive workflow. No automated Mega download or closed EPC extraction.'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  connector_key = EXCLUDED.connector_key,
  enabled = EXCLUDED.enabled,
  priority = EXCLUDED.priority,
  requires_authentication = EXCLUDED.requires_authentication,
  configuration = EXCLUDED.configuration,
  allows_download = EXCLUDED.allows_download,
  manufacturer_scope = EXCLUDED.manufacturer_scope,
  notes = EXCLUDED.notes;

COMMIT;