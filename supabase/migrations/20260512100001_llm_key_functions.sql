-- ============================================================
-- 20260512100001_llm_key_functions.sql
-- Ensures store_llm_key and get_decrypted_llm_key RPCs exist
-- and match the call signatures used by the application.
--
-- store_llm_key is called from /api/admin/keys with:
--   p_org_id    — Supabase org UUID (resolved from Clerk org ID by caller)
--   p_provider  — 'anthropic' | 'openai' | 'google' | 'deepseek'
--   p_plaintext — the raw API key
--   p_kms_key   — the KMS passphrase (KMS_SECRET env var)
--
-- get_decrypted_llm_key is called from lib/langgraph/llm-factory.ts with:
--   p_org_id    — Supabase org UUID
--   p_kms_key   — the KMS passphrase (KMS_SECRET env var)
-- ============================================================

-- Ensure the llm_keys table exists (idempotent; also created in 005_org_api_keys.sql)
CREATE TABLE IF NOT EXISTS llm_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  key_encrypted bytea NOT NULL,
  key_hint      text NOT NULL,
  label         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES org_members(id),
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One active key per provider per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_keys_one_active
  ON llm_keys (org_id, provider)
  WHERE is_active = true;

-- ============================================================
-- store_llm_key — upsert an encrypted BYOK key
-- ============================================================
CREATE OR REPLACE FUNCTION store_llm_key(
  p_org_id    uuid,
  p_provider  text,
  p_plaintext text,
  p_kms_key   text
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Deactivate any existing active key for this provider
  UPDATE llm_keys
    SET is_active = false, updated_at = now()
  WHERE org_id = p_org_id
    AND provider = p_provider
    AND is_active = true;

  -- Insert the new key
  INSERT INTO llm_keys (org_id, provider, key_encrypted, key_hint, is_active)
  VALUES (
    p_org_id,
    p_provider,
    pgp_sym_encrypt(p_plaintext, p_kms_key),
    '...' || right(p_plaintext, 4),
    true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION store_llm_key(uuid, text, text, text) TO service_role;

-- ============================================================
-- get_decrypted_llm_key — fetch and decrypt the active BYOK key
-- ============================================================
CREATE OR REPLACE FUNCTION get_decrypted_llm_key(
  p_org_id  uuid,
  p_kms_key text
)
RETURNS TABLE (
  provider  text,
  plaintext text
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    lk.provider,
    pgp_sym_decrypt(lk.key_encrypted, p_kms_key)::text AS plaintext
  FROM llm_keys lk
  WHERE lk.org_id = p_org_id
    AND lk.is_active = true
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_decrypted_llm_key(uuid, text) TO service_role;
