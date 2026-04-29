-- ============================================================
-- 009_nango_connections.sql — Nango connection ownership mapping
-- ============================================================
-- Lightweight mapping table that links Nango connection IDs to
-- Athene orgs. Used by lib/nango/client.ts to verify ownership
-- before fetching tokens or listing connections.
--
-- This is separate from the `connections` table (001_schema.sql)
-- which tracks full integration state (sync cursors, status, etc.).
-- ============================================================

CREATE TABLE nango_connections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id       text NOT NULL,           -- Nango connection identifier
  provider_config_key text NOT NULL,           -- Nango provider config key (e.g. 'google-drive', 'outlook')
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_nango_conn UNIQUE (org_id, connection_id, provider_config_key)
);

-- ============================================================
-- RLS — org-scoped access
-- ============================================================

ALTER TABLE nango_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY nango_connections_read ON nango_connections FOR SELECT
  USING (org_id::text = app_setting('org_id'));

CREATE POLICY nango_connections_admin_write ON nango_connections FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') IN ('admin', 'super_user')
  );

-- Note: lib/nango/client.ts uses supabaseAdmin (service role), which
-- bypasses RLS entirely. No additional permissive policy needed.

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_nango_connections_org ON nango_connections(org_id);
