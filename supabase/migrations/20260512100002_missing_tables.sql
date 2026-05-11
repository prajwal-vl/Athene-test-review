-- ============================================================
-- 20260512100002_missing_tables.sql
-- Creates tables referenced by application code that may not
-- exist on fresh deploys depending on migration order.
-- All statements use IF NOT EXISTS so this migration is safe
-- to run against a database that already has these tables.
-- ============================================================

-- audit_logs — written by /api/admin/audit-log
CREATE TABLE IF NOT EXISTS audit_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES org_members(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  metadata   jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_org_created
  ON audit_logs (org_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY audit_logs_admin_read ON audit_logs
    FOR SELECT
    USING (
      org_id::text = current_setting('app.org_id', true)
      AND current_setting('app.user_role', true) = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- bi_access_audit — written by cross-dept-agent after every cross-department query
CREATE TABLE IF NOT EXISTS bi_access_audit (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   uuid        REFERENCES org_members(id) ON DELETE SET NULL,
  query     text,
  dept      text,
  doc_id    uuid,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bi_access_audit_org_ts
  ON bi_access_audit (org_id, timestamp DESC);

ALTER TABLE bi_access_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY bi_access_audit_admin_read ON bi_access_audit
    FOR SELECT
    USING (
      org_id::text = current_setting('app.org_id', true)
      AND current_setting('app.user_role', true) IN ('admin', 'super_user')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY bi_access_audit_agent_insert ON bi_access_audit
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- automations — user-configured scheduled tasks (also in 007_user_automations.sql)
DO $$ BEGIN
  CREATE TYPE automation_status AS ENUM ('active', 'paused', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS automations (
  id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid             NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            uuid             NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  type               text             NOT NULL,
  status             automation_status NOT NULL DEFAULT 'paused',
  config             jsonb            DEFAULT '{}',
  cron_expression    text,
  qstash_schedule_id text,
  last_run_at        timestamptz,
  last_run_status    text,
  last_error         text,
  next_run_at        timestamptz,
  run_count          int              NOT NULL DEFAULT 0,
  created_by         text,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now(),

  UNIQUE (org_id, user_id, type)
);

-- briefings — generated morning briefing content (also in 007_user_automations.sql)
CREATE TABLE IF NOT EXISTS briefings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  automation_id   uuid        REFERENCES automations(id) ON DELETE SET NULL,
  content         jsonb       NOT NULL DEFAULT '{}',
  summary         text,
  calendar_items  int         DEFAULT 0,
  email_items     int         DEFAULT 0,
  doc_items       int         DEFAULT 0,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  delivered       boolean     NOT NULL DEFAULT false,
  delivered_at    timestamptz,
  delivery_method text        DEFAULT 'in_app',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- insights — saved BI query cards (also in 007_user_automations.sql)
CREATE TABLE IF NOT EXISTS insights (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  uuid        NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  query       text        NOT NULL,
  result      jsonb,
  citations   jsonb       DEFAULT '[]',
  sort_order  int         DEFAULT 0,
  refreshed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
