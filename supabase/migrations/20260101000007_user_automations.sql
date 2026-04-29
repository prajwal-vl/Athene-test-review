-- ============================================================
-- 007_user_automations.sql — Automations + Briefings
-- ============================================================

-- ============================================================
-- Automations — user-configured scheduled tasks
-- ============================================================

CREATE TYPE automation_status AS ENUM (
  'active',
  'paused',
  'error'
);

CREATE TABLE automations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  type            text NOT NULL,             -- 'morning_briefing', 'weekly_report'
  status          automation_status NOT NULL DEFAULT 'paused',
  config          jsonb DEFAULT '{}',        -- type-specific settings
  cron_expression text,                      -- '0 7 * * *' for daily 7am
  qstash_schedule_id text,                   -- QStash schedule reference for unschedule
  last_run_at     timestamptz,
  last_run_status text,                      -- 'ok' | 'error'
  last_error      text,
  next_run_at     timestamptz,
  run_count       int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, user_id, type)
);

-- ============================================================
-- Briefings — generated morning briefing content
-- ============================================================

CREATE TABLE briefings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  automation_id   uuid REFERENCES automations(id) ON DELETE SET NULL,
  content         jsonb NOT NULL,            -- structured briefing sections
  summary         text,                      -- one-line summary for list view
  calendar_items  int DEFAULT 0,
  email_items     int DEFAULT 0,
  doc_items       int DEFAULT 0,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  delivered       boolean NOT NULL DEFAULT false,
  delivered_at    timestamptz,
  delivery_method text DEFAULT 'in_app',     -- 'in_app' | 'email'
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Insights — saved BI query cards
-- ============================================================

CREATE TABLE insights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  title           text NOT NULL,
  query           text NOT NULL,             -- the natural-language question
  result          jsonb,                     -- cached agent answer
  citations       jsonb DEFAULT '[]',
  sort_order      int DEFAULT 0,
  refreshed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================

-- Automations: users manage their own
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY automations_own ON automations FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND user_id::text = app_setting('user_id')
  );

CREATE POLICY automations_admin ON automations FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

-- Briefings: users see their own
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY briefings_own ON briefings FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND user_id::text = app_setting('user_id')
  );

CREATE POLICY briefings_service_write ON briefings FOR INSERT
  WITH CHECK (org_id::text = app_setting('org_id'));

-- Insights: admin + super_user
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY insights_read ON insights FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') IN ('admin', 'super_user')
  );

CREATE POLICY insights_own_write ON insights FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND (
      created_by::text = app_setting('user_id')
      OR app_setting('user_role') = 'admin'
    )
  );

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_automations_org_user ON automations(org_id, user_id);
CREATE INDEX idx_automations_active ON automations(org_id, status) WHERE status = 'active';
CREATE INDEX idx_automations_next_run ON automations(next_run_at) WHERE status = 'active';

CREATE INDEX idx_briefings_org_user ON briefings(org_id, user_id);
CREATE INDEX idx_briefings_date ON briefings(org_id, user_id, generated_at DESC);
CREATE INDEX idx_briefings_undelivered ON briefings(org_id, delivered) WHERE delivered = false;

CREATE INDEX idx_insights_org ON insights(org_id);
CREATE INDEX idx_insights_owner ON insights(org_id, created_by);
CREATE INDEX idx_insights_sort ON insights(org_id, sort_order);

-- ============================================================
-- Triggers
-- ============================================================

CREATE TRIGGER trg_automations_updated_at
  BEFORE UPDATE ON automations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_insights_updated_at
  BEFORE UPDATE ON insights FOR EACH ROW EXECUTE FUNCTION update_updated_at();
