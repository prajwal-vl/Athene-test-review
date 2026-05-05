-- ============================================================
-- 005_org_api_keys.sql — BYOK (Bring Your Own Key) for LLM APIs
-- ============================================================
-- Keys are encrypted at rest using pgp_sym_encrypt.
-- The encryption passphrase is set via session variable app.kms_key,
-- which comes from the KMS_SECRET env var — never hardcoded.
--
-- NEVER return decrypted keys to the frontend.
-- Only last 4 chars are shown in the admin UI.
-- ============================================================

CREATE TABLE llm_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        text NOT NULL,             -- 'anthropic', 'openai', 'google'
  key_encrypted   bytea NOT NULL,            -- pgp_sym_encrypt(key, kms_key)
  key_hint        text NOT NULL,             -- last 4 chars for UI display (e.g., '...a3Bx')
  label           text,                      -- friendly name: "Production Anthropic Key"
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid NOT NULL REFERENCES org_members(id),
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE key per provider per org (partial unique index).
-- Inactive rows may freely duplicate; only active rows are constrained.
CREATE UNIQUE INDEX idx_llm_keys_one_active
  ON llm_keys(org_id, provider)
  WHERE is_active = true;

-- ============================================================
-- Function to encrypt a key (called from the API route)
-- ============================================================

CREATE OR REPLACE FUNCTION encrypt_llm_key(plaintext_key text)
RETURNS bytea AS $$
BEGIN
  RETURN pgp_sym_encrypt(
    plaintext_key,
    current_setting('app.kms_key')
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function to decrypt a key (called from agent LLM factory)
-- ============================================================

CREATE OR REPLACE FUNCTION decrypt_llm_key(encrypted_key bytea)
RETURNS text AS $$
BEGIN
  RETURN pgp_sym_decrypt(
    encrypted_key,
    current_setting('app.kms_key')
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS on llm_keys — admin only
-- ============================================================

ALTER TABLE llm_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY keys_admin_read ON llm_keys FOR SELECT
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

CREATE POLICY keys_admin_write ON llm_keys FOR ALL
  USING (
    org_id::text = app_setting('org_id')
    AND app_setting('user_role') = 'admin'
  );

-- Service role can read keys for decryption during agent runs
-- (The agent API route sets app.kms_key before calling decrypt_llm_key)
CREATE POLICY keys_service_read ON llm_keys FOR SELECT
  USING (org_id::text = app_setting('org_id'));

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_llm_keys_org ON llm_keys(org_id);
CREATE INDEX idx_llm_keys_org_provider ON llm_keys(org_id, provider, is_active);

-- ============================================================
-- updated_at trigger
-- ============================================================

CREATE TRIGGER trg_llm_keys_updated_at
  BEFORE UPDATE ON llm_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
