-- Fix handle_new_user trigger so a profile insert failure
-- never blocks auth user creation. Wrap in EXCEPTION handler.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id uuid;
  v_role      text;
BEGIN
  -- Safely cast tenant_id — null is fine, avoids cast errors
  BEGIN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_tenant_id := NULL;
  END;

  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'sales_rep');

  INSERT INTO public.profiles (id, tenant_id, full_name, email, role)
  VALUES (
    NEW.id,
    v_tenant_id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    v_role
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id  = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id),
    full_name  = COALESCE(EXCLUDED.full_name,  profiles.full_name),
    email      = COALESCE(EXCLUDED.email,      profiles.email),
    role       = COALESCE(EXCLUDED.role,       profiles.role);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log but never block user creation
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
