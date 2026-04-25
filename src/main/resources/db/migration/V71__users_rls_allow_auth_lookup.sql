-- Allow cross-tenant user lookup when no tenant is set (authentication flow).
-- SELECT: visible to own tenant OR when session variable is unset (auth/login).
-- INSERT/UPDATE: always require restaurant_id to match current tenant.
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (
    NULLIF(current_setting('app.current_restaurant_id', true), '') IS NULL
    OR restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint
  )
  WITH CHECK (
    restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint
  );
