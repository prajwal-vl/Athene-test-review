CREATE TABLE IF NOT EXISTS pending_background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    url TEXT NOT NULL,
    body JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_jobs_org_source ON pending_background_jobs(org_id, source_type, status);
