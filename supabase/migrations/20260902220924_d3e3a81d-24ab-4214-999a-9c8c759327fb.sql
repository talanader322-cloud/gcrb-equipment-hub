CREATE INDEX IF NOT EXISTS ix_catalog_scheme_parts_number_trgm
  ON public.catalog_scheme_parts USING gin (number gin_trgm_ops)
  WHERE number IS NOT NULL AND number <> '';

CREATE INDEX IF NOT EXISTS ix_catalog_scheme_parts_short_number_trgm
  ON public.catalog_scheme_parts USING gin (short_number gin_trgm_ops)
  WHERE short_number IS NOT NULL AND short_number <> '';

CREATE INDEX IF NOT EXISTS ix_catalog_scheme_parts_name_trgm
  ON public.catalog_scheme_parts USING gin (name gin_trgm_ops)
  WHERE name IS NOT NULL AND name <> '';

CREATE OR REPLACE FUNCTION public.search_catalog_scheme_parts(
  p_query text,
  p_manufacturer_id uuid DEFAULT NULL,
  p_machine_model_id uuid DEFAULT NULL
)
RETURNS TABLE (
  scheme_part_id uuid,
  scheme_id uuid,
  catalog_id uuid,
  catalog_title text,
  catalog_number text,
  machine_model_id uuid,
  model_name text,
  manufacturer_id uuid,
  manufacturer_name text,
  page_number integer,
  scheme_title text,
  image_url text,
  image_storage_path text,
  item_ref text,
  number text,
  short_number text,
  name text,
  quantity text,
  match_rank integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH input AS (
    SELECT
      NULLIF(TRIM(COALESCE(p_query, '')), '') AS raw,
      public.normalize_code(NULLIF(TRIM(COALESCE(p_query, '')), '')) AS code,
      public.normalize_text(NULLIF(TRIM(COALESCE(p_query, '')), '')) AS text
  )
  SELECT
    csp.id,
    cs.id,
    c.id,
    c.title,
    c.catalog_number,
    COALESCE(c.machine_model_id, cmr.machine_model_id),
    mm.model_name,
    m.id,
    m.name,
    cs.page_number,
    cs.title,
    cs.image_url,
    cs.image_storage_path,
    csp.item_ref,
    csp.number,
    csp.short_number,
    csp.name,
    csp.quantity,
    CASE
      WHEN public.normalize_code(COALESCE(csp.number, '')) = input.code
        OR public.normalize_code(COALESCE(csp.short_number, '')) = input.code
        THEN 0
      WHEN csp.number ILIKE '%' || input.raw || '%'
        OR csp.short_number ILIKE '%' || input.raw || '%'
        THEN 1
      WHEN public.normalize_text(COALESCE(csp.name, '')) ILIKE '%' || input.text || '%'
        THEN 2
      ELSE 3
    END AS match_rank
  FROM public.catalog_scheme_parts csp
  JOIN public.catalog_schemes cs ON cs.id = csp.scheme_id
  JOIN public.catalogs c ON c.id = cs.catalog_id
  JOIN public.manufacturers m ON m.id = c.manufacturer_id
  LEFT JOIN public.catalog_machine_relations cmr ON cmr.catalog_id = c.id
  LEFT JOIN public.machine_models mm
    ON mm.id = COALESCE(c.machine_model_id, cmr.machine_model_id)
  CROSS JOIN input
  WHERE input.raw IS NOT NULL
    AND (
      csp.number ILIKE '%' || input.raw || '%'
      OR csp.short_number ILIKE '%' || input.raw || '%'
      OR csp.item_ref ILIKE '%' || input.raw || '%'
      OR public.normalize_text(COALESCE(csp.name, '')) ILIKE '%' || input.text || '%'
    )
    AND (p_manufacturer_id IS NULL OR c.manufacturer_id = p_manufacturer_id)
    AND (
      p_machine_model_id IS NULL
      OR c.machine_model_id = p_machine_model_id
      OR cmr.machine_model_id = p_machine_model_id
    )
  ORDER BY match_rank, cs.page_number, csp.item_ref NULLS LAST, csp.number NULLS LAST
  LIMIT 100;
$function$;

REVOKE ALL ON FUNCTION public.search_catalog_scheme_parts(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_catalog_scheme_parts(text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_catalog_scheme_parts(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_catalog_scheme_parts(text, uuid, uuid) TO service_role;