-- ============================================================
-- 20260512200000_bi_access_grants.sql
-- Creates the bi_access_grants table used for BI analyst
-- cross-department access. user_id FKs to org_members.id so
-- PostgREST can resolve the FK join in rbac.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS bi_access_grants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES org_members(id)   ON DELETE CASCADE,
  dept_id     uuid        NOT NULL REFERENCES departments(id)   ON DELETE CASCADE,
  is_active   boolean     NOT NULL DEFAULT true,
  expires_at  timestamptz,                                        -- NULL = permanent
  created_by  uuid        REFERENCES org_members(id)            ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- one grant row per (org, member, department) pair; re-granting is a no-op
  UNIQUE (org_id, user_id, dept_id)
);

-- Fast lookups: "all grants for a user" and "all grants for a dept"
CREATE INDEX IF NOT EXISTS idx_bi_access_grants_user
  ON bi_access_grants (org_id, user_id);

CREATE INDEX IF NOT EXISTS idx_bi_access_grants_dept
  ON bi_access_grants (org_id, dept_id);

-- ============================================================
-- Row-Level Security
-- ============================================================
ALTER TABLE bi_access_grants ENABLE ROW LEVEL SECURITY;

-- Admins and super_users can fully manage grants for their org
DO $$ BEGIN
  CREATE POLICY bi_grants_admin_all ON bi_access_grants
    FOR ALL
    USING (
      org_id::text = current_setting('app.org_id', true)
      AND current_setting('app.user_role', true) IN ('admin', 'super_user')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BI analysts can read their own grants (needed for vector_search_cross_dept)
DO $$ BEGIN
  CREATE POLICY bi_grants_self_read ON bi_access_grants
    FOR SELECT
    USING (
      org_id::text = current_setting('app.org_id', true)
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
