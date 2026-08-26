ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.normalize_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    NEW.username := lower(btrim(NEW.username));
    IF NEW.username = '' THEN
      NEW.username := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_normalize_username ON public.profiles;
CREATE TRIGGER profiles_normalize_username
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalize_username();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
  ON public.profiles (username) WHERE username IS NOT NULL;

-- Guard: non-admins may not change username or active on their own profile
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / backend
  END IF;
  IF public.has_role(auth.uid(), 'system_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.username IS DISTINCT FROM OLD.username OR NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'Only system administrators can change username or active status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_fields ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_fields();

DROP POLICY IF EXISTS "admins manage profiles" ON public.profiles;
CREATE POLICY "admins manage profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'system_admin'))
WITH CHECK (public.has_role(auth.uid(), 'system_admin'));

CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  client_key text,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.auth_login_attempts TO service_role;
ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS auth_login_attempts_lookup_idx
  ON public.auth_login_attempts (username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS auth_login_attempts_client_idx
  ON public.auth_login_attempts (client_key, attempted_at DESC);