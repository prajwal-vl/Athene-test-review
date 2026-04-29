-- ============================================================
-- 006_org_integrations.sql — Integration sync tracking
-- ============================================================
-- Tracks sync jobs triggered by QStash workers.
-- Each job processes one connection's delta sync.
-- ============================================================

CREATE TYPE sync_status AS ENUM (
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled'
);

-- ============================================================
-- Sync Jobs — one row per sync run
-- ============================================================

CREATE TABLE sync_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  status          sync_status NOT NULL DEFAULT 'queued',
  job_type        text NOT NULL DEFAULT 'delta',  -- 'full' | 'delta'
  docs_processed  int NOT NULL DEFAULT 0,
  docs_added      int NOT NULL DEFAULT 0,
  docs_updated    int NOT NULL DEFAULT 0,
  docs_deleted    int NOT NULL DEFAULT 0,
  chunks_created  int NOT NULL DEFAULT 0,
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  idempotency_key text UNIQUE,               -- QStash job ID for retry dedup
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Webhook Events — incoming Nango sync notifications
-- ============================================================

CREATE TABLE webhook_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid,
  connection_id   uuid REFERENCES connections(id) ON DELETE SET NULL,
  provider        text NOT NULL,
  event_type      text NOT NULL,             -- 'sync.completed', 'connection.deleted', etc.
  payload         jsonb NOT NULL,
  processed       boolean NOT NULL DEFAULT false,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_jobs_read ON sync_jobs FOR SELECT
  USING (org_id::text = app_setting('org_id'));

CREATE POLICY sync_jobs_admin_write ON sync_jobs FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_admin_read ON webhook_events FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

-- Service role writes webhook events (no user context at webhook time)
CREATE POLICY webhook_service_write ON webhook_events FOR INSERT
  WITH CHECK (true);  -- webhook handler runs with service role

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_sync_jobs_org ON sync_jobs(org_id);
CREATE INDEX idx_sync_jobs_connection ON sync_jobs(connection_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(org_id, status);
CREATE INDEX idx_sync_jobs_created ON sync_jobs(org_id, created_at DESC);
CREATE INDEX idx_sync_jobs_idempotency ON sync_jobs(idempotency_key);

CREATE INDEX idx_webhook_events_org ON webhook_events(org_id);
CREATE INDEX idx_webhook_events_unprocessed ON webhook_events(processed)
  WHERE processed = false;
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at DESC);
