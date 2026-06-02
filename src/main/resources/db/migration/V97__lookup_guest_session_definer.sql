-- Guest session lookup for QR public API: /api/public/** skips TenantFilter, so app.current_restaurant_id
-- is unset and RLS would hide guest_sessions rows. This SECURITY DEFINER function runs as its owner
-- (the Flyway migration role — typically a superuser such as postgres) and therefore can read the row
-- for a valid session token. Ensure Flyway is not executed as the same low-privilege role as the app,
-- or the function owner will still be subject to RLS.
CREATE OR REPLACE FUNCTION lookup_guest_session(p_token text)
RETURNS SETOF guest_sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT *
FROM guest_sessions
WHERE session_token = btrim(p_token)
  AND expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION lookup_guest_session(text) TO PUBLIC;
