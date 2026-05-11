-- ============================================================
-- 20260512100003_rls_session_helpers.sql
-- Ensures the has_session_grants() function exists and is
-- consistent with the version in 008_rls_helpers.sql.
--
-- This function is referenced by RLS policies in
-- 002_rls_policies.sql (has_any_department_grant calls it).
-- The canonical implementation checks for the existence of the
-- session_grants temporary table created by
-- initialize_secure_session() (20260511000000_unified_security.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION has_session_grants()
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'session_grants'
      AND n.nspname LIKE 'pg_temp_%'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION has_session_grants() TO service_role, authenticated, anon;
