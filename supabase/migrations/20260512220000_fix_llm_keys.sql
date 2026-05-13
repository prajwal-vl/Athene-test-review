-- Reset the llm_keys table to fix broken foreign key constraints
DROP TABLE IF EXISTS llm_keys CASCADE;

CREATE TABLE llm_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        text NOT NULL,
  label           text,
  key_encrypted   bytea NOT NULL,
  key_hint        text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
