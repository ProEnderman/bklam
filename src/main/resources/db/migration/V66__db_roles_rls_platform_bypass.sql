-- Create roles for tenant (RLS enforced) and platform (RLS bypass).
-- Requires superuser; run manually in production if the app user cannot create roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform') THEN
    CREATE ROLE app_platform LOGIN;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot create roles (need superuser). Create app_tenant and app_platform manually.';
END$$;

-- Platform role bypasses row security for HEAD_ADMIN operations (only if role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform') THEN
    ALTER ROLE app_platform SET row_security = off;
  END IF;
END$$;

-- Ensure privileges (tenant keeps default row_security = on)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform') THEN
    GRANT USAGE ON SCHEMA public TO app_tenant, app_platform;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant, app_platform;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant, app_platform;
  END IF;
END$$;
