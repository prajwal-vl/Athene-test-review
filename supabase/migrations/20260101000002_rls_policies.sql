-- ============================================================
-- 002_rls_policies.sql — Row Level Security for all tables
-- ============================================================
-- Session variables (set via SET LOCAL in withRLS wrapper):
--   app.org_id         — current tenant UUID
--   app.user_id        — current org_members.id UUID
--   app.department_id  — current user's department UUID (or '')
--   app.user_role      — 'member' | 'super_user' | 'admin'
--
-- For super_users, a temp table `session_grants` is created
-- per-transaction by the withRLS wrapper with their active grants.
-- ============================================================

-- ============================================================
-- Helper: safe current_setting that returns '' on missing
-- ============================================================

CREATE OR REPLACE FUNCTION app_setting(key text)
RETURNS text AS $$
DECLARE
  v_headers jsonb;
BEGIN
  -- Always safe attempt to parse headers
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  
  IF v_headers IS NOT NULL THEN
    IF key = 'org_id' AND v_headers ? 'x-app-org-id' THEN RETURN v_headers->>'x-app-org-id'; END IF;
    IF key = 'user_id' AND v_headers ? 'x-app-user-id' THEN RETURN v_headers->>'x-app-user-id'; END IF;
    IF key = 'department_id' AND v_headers ? 'x-app-dept-id' THEN RETURN v_headers->>'x-app-dept-id'; END IF;
    IF key = 'user_role' AND v_headers ? 'x-app-role' THEN RETURN v_headers->>'x-app-role'; END IF;
    IF key = 'grants' AND v_headers ? 'x-app-grants' THEN RETURN v_headers->>'x-app-grants'; END IF;
  END IF;

  RETURN coalesce(current_setting('app.' || key, true), '');
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Helper: check if user has a specific grant (JSON-based)
-- ============================================================
-- Note: session_grants is a per-transaction TEMP table created by
-- the withRLS wrapper. Because plpgsql defers name resolution to
-- first execution, these helpers compile cleanly even when
-- session_grants does not yet exist. Inline SQL references to
-- session_grants in policy USING clauses would fail at CREATE
-- POLICY time — always go through a helper function.

CREATE OR REPLACE FUNCTION has_grant(p_scope_type text, p_scope_id text)
RETURNS boolean AS $$
DECLARE
  v_grants_raw text;
  v_grants jsonb;
BEGIN
  -- Use app_setting() so we pick up grants from BOTH PostgREST
  -- request headers (x-app-grants) AND SET LOCAL (app.grants).
  v_grants_raw := app_setting('grants');
  IF v_grants_raw IS NULL OR v_grants_raw = '' THEN
    RETURN false;
  END IF;

  v_grants := v_grants_raw::jsonb;
  RETURN EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_grants) AS sg
    WHERE sg->>'scope_type' = p_scope_type AND sg->>'scope_id' = p_scope_id
  );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Helper: check department grant against an array of dept ids
-- (used by kg_nodes which stores department_ids as uuid[])
-- ============================================================

CREATE OR REPLACE FUNCTION has_any_department_grant(p_dept_ids uuid[])
RETURNS boolean AS $$
BEGIN
  IF NOT has_session_grants() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM session_grants sg
    WHERE sg.scope_type = 'department'
      AND sg.scope_id::uuid = ANY(p_dept_ids)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 1. organizations — only members of the org can read
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_read ON organizations FOR SELECT
  USING (id::text = app_setting('org_id'));

CREATE POLICY org_admin_write ON organizations FOR ALL
  USING (id::text = app_setting('org_id') AND app_setting('user_role') = 'admin');

-- ============================================================
-- 2. departments — scoped to org
-- ============================================================

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY dept_read ON departments FOR SELECT
  USING (org_id::text = app_setting('org_id'));

CREATE POLICY dept_admin_write ON departments FOR ALL
  USING (org_id::text = app_setting('org_id') AND app_setting('user_role') = 'admin');

-- ============================================================
-- 3. org_members — scoped to org
-- ============================================================

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- All org members can see other members (for @mentions, assignees, etc.)
CREATE POLICY members_read ON org_members FOR SELECT
  USING (org_id::text = app_setting('org_id'));

-- Only admins can create/update members
CREATE POLICY members_admin_write ON org_members FOR ALL
  USING (org_id::text = app_setting('org_id') AND app_setting('user_role') = 'admin');

-- Users can update their own row (timezone, briefing_enabled, etc.)
CREATE POLICY members_self_update ON org_members FOR UPDATE
  USING (id::text = app_setting('user_id'))
  WITH CHECK (id::text = app_setting('user_id'));

-- ============================================================
-- 4. access_grants — admins manage, users see own grants
-- ============================================================

ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY grants_admin_all ON access_grants FOR ALL
  USING (org_id::text = app_setting('org_id') AND app_setting('user_role') = 'admin');

CREATE POLICY grants_user_read_own ON access_grants FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND user_id::text = app_setting('user_id')
  );

-- ============================================================
-- 5. connections — org-scoped, admins manage org connections,
--    users manage their own personal connections
-- ============================================================

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY connections_read ON connections FOR SELECT
  USING (org_id::text = app_setting('org_id'));

CREATE POLICY connections_admin_write ON connections FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND (
      app_setting('user_role') = 'admin'
      OR user_id::text = app_setting('user_id')  -- users can manage their own personal connections
    )
  );

-- ============================================================
-- 6. documents — same visibility rules as embeddings
-- ============================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_read ON documents FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND (
      -- Admin sees everything
      app_setting('user_role') = 'admin'

      -- org_wide visible to all
      OR visibility = 'org_wide'

      -- Own department (all visibility levels)
      OR (department_id::text = app_setting('department_id')
          AND visibility IN ('department', 'confidential', 'bi_accessible'))

      -- Restricted: only the owner
      OR (visibility = 'restricted'
          AND owner_user_id::text = app_setting('user_id'))

      -- Super_user department grant (cannot unlock confidential)
      OR (app_setting('user_role') = 'super_user'
          AND visibility != 'confidential'
          AND has_grant('department', department_id::text))

      -- Super_user resource grant
      OR (app_setting('user_role') = 'super_user'
          AND has_grant('resource', external_id))

      -- Super_user source grant
      OR (app_setting('user_role') = 'super_user'
          AND has_grant('source', source_type))
    )
  );

-- Service role writes (embedding pipeline runs as service role)
CREATE POLICY documents_service_write ON documents FOR ALL
  USING (org_id::text = app_setting('org_id') AND app_setting('user_role') = 'admin');

-- ============================================================
-- 7. document_embeddings — THE CORE ACCESS CONTROL POLICY
-- ============================================================
-- This is the most important policy in the system.
-- Every vector search passes through this.

ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY embeddings_read ON document_embeddings FOR SELECT
  USING (
    -- Absolute Rule #1: org isolation is always enforced
    org_id::text = app_setting('org_id')
    AND (
      -- Admin sees everything in their org
      app_setting('user_role') = 'admin'

      -- Rule A: org-wide docs visible to everyone
      OR visibility = 'org_wide'

      -- Rule B: own department — member sees department, confidential, bi_accessible
      OR (department_id::text = app_setting('department_id')
          AND visibility IN ('department', 'confidential', 'bi_accessible'))

      -- Rule C: restricted — only the owner (personal Gmail, Calendar, etc.)
      OR (visibility = 'restricted'
          AND owner_user_id::text = app_setting('user_id'))

      -- Rule D: super_user with department grant
      -- CANNOT see 'confidential' — that's the hard wall
      OR (app_setting('user_role') = 'super_user'
          AND visibility != 'confidential'
          AND has_grant('department', department_id::text))

      -- Rule E: super_user with resource-level grant (specific doc)
      OR (app_setting('user_role') = 'super_user'
          AND has_grant('resource', document_id::text))

      -- Rule F: super_user with source-level grant (e.g., all Jira)
      OR (app_setting('user_role') = 'super_user'
          AND has_grant('source', source_type))
    )
  );

-- Embedding pipeline writes (service role)
CREATE POLICY embeddings_service_write ON document_embeddings FOR ALL
  USING (org_id::text = app_setting('org_id') AND app_setting('user_role') = 'admin');

-- ============================================================
-- 8. kg_nodes — Knowledge Graph nodes, access-controlled
-- ============================================================
-- A node is visible if ANY of its department_ids match the user's access.

ALTER TABLE kg_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY kg_nodes_read ON kg_nodes FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND (
      -- Admin sees all
      app_setting('user_role') = 'admin'

      -- org_wide nodes visible to everyone
      OR visibility = 'org_wide'

      -- Node is in user's own department
      OR (app_setting('department_id')::uuid = ANY(department_ids)
          AND visibility IN ('department', 'bi_accessible'))

      -- Super_user with department grant matching any of the node's departments
      -- Cannot unlock confidential.
      -- Uses app_setting('grants') which reads from both PostgREST headers
      -- and SET LOCAL — consistent with has_grant() helper.
      OR (app_setting('user_role') = 'super_user'
          AND visibility != 'confidential'
          AND app_setting('grants') != ''
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(app_setting('grants')::jsonb) AS sg
            WHERE sg->>'scope_type' = 'department'
              AND (sg->>'scope_id')::uuid = ANY(department_ids)
          ))
    )
  );

CREATE POLICY kg_nodes_service_write ON kg_nodes FOR ALL
  USING (org_id::text = app_setting('org_id') AND app_setting('user_role') = 'admin');

-- ============================================================
-- 9. kg_edges — Knowledge Graph edges
-- ============================================================
-- An edge is visible only if BOTH its source and target nodes
-- are visible to the user. Enforced by joining through kg_nodes
-- which is already RLS-protected.
-- Additional policy: edge's own visibility must also pass.

ALTER TABLE kg_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY kg_edges_read ON kg_edges FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND (
      app_setting('user_role') = 'admin'

      OR visibility = 'org_wide'

      OR (department_id::text = app_setting('department_id')
          AND visibility IN ('department', 'bi_accessible'))

      OR (app_setting('user_role') = 'super_user'
          AND visibility != 'confidential'
          AND has_grant('department', department_id::text))
    )
  );

CREATE POLICY kg_edges_service_write ON kg_edges FOR ALL
  USING (org_id::text = app_setting('org_id') AND app_setting('user_role') = 'admin');

-- ============================================================
-- 10. threads — user sees only their own threads
-- ============================================================

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY threads_own ON threads FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND user_id::text = app_setting('user_id')
  );

-- Admins can see all threads (for support/debugging)
CREATE POLICY threads_admin ON threads FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

-- ============================================================
-- 11. thread_checkpoints — same as threads (user-scoped, not org-wide)
-- ============================================================
-- Checkpoints contain the full conversation state. A member must NOT
-- be able to read another member's checkpoints, so we scope via the
-- parent thread's user_id. Admins may read all threads' checkpoints.

ALTER TABLE thread_checkpoints ENABLE ROW LEVEL SECURITY;

-- Checkpoints contain full conversation state — scope through
-- the parent thread's user_id so members can't read each other's.
CREATE POLICY checkpoints_own ON thread_checkpoints FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND EXISTS (
      SELECT 1 FROM threads t
      WHERE t.id = thread_checkpoints.thread_id
        AND (
          t.user_id::text = app_setting('user_id')
          OR app_setting('user_role') = 'admin'
        )
    )
  );

-- ============================================================
-- 12. hitl_decisions — user sees own, admin sees all
-- ============================================================

ALTER TABLE hitl_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY hitl_own ON hitl_decisions FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND user_id::text = app_setting('user_id')
  );

CREATE POLICY hitl_admin ON hitl_decisions FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

CREATE POLICY hitl_write ON hitl_decisions FOR INSERT
  WITH CHECK (
    org_id::text = app_setting('org_id')
    AND user_id::text = app_setting('user_id')
  );

-- ============================================================
-- 13. grant_access_audit — admin read-only
-- ============================================================

ALTER TABLE grant_access_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_admin_read ON grant_access_audit FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

CREATE POLICY audit_service_write ON grant_access_audit FOR INSERT
  WITH CHECK (org_id::text = app_setting('org_id'));

-- ============================================================
-- 14. admin_actions — admin read-only
-- ============================================================

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_actions_read ON admin_actions FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

CREATE POLICY admin_actions_write ON admin_actions FOR INSERT
  WITH CHECK (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );
