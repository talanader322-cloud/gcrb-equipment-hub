CREATE OR REPLACE FUNCTION public.normalize_code(input TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(UPPER(REGEXP_REPLACE(COALESCE(input,''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION public.normalize_text(input TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(UPPER(TRIM(REGEXP_REPLACE(COALESCE(input,''), '\s+', ' ', 'g'))), '')
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM anon, public;
REVOKE ALL ON FUNCTION public.can_manage_catalog(UUID) FROM anon, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_catalog(UUID) TO authenticated, service_role;