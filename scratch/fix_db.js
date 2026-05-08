const { Client } = require('pg');

const connectionString = 'postgresql://postgres:hVr1F7MyA4ktP3P7@db.vklqtyphfmdgqramwvfm.supabase.co:5432/postgres';

const sql = `
-- 1. Create a set_config helper that PostgREST can call via RPC
CREATE OR REPLACE FUNCTION set_config_value(name text, value text)
RETURNS void AS $$
BEGIN
  -- set_config(name, value, is_local)
  -- Third arg 'true' means it only lasts for the current transaction/request
  PERFORM set_config(name, value, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure llm_keys table exists (matching the migration we saw)
CREATE TABLE IF NOT EXISTS llm_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  provider        text NOT NULL,
  key_encrypted   bytea NOT NULL,
  key_hint        text NOT NULL,
  label           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3. Ensure the encryption function exists and uses app.kms_key
CREATE OR REPLACE FUNCTION encrypt_llm_key(plaintext_key text)
RETURNS bytea AS $$
BEGIN
  RETURN pgp_sym_encrypt(
    plaintext_key,
    current_setting('app.kms_key')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Grant execute to public (PostgREST)
GRANT EXECUTE ON FUNCTION set_config_value(text, text) TO anon;
GRANT EXECUTE ON FUNCTION set_config_value(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_config_value(text, text) TO service_role;

GRANT EXECUTE ON FUNCTION encrypt_llm_key(text) TO anon;
GRANT EXECUTE ON FUNCTION encrypt_llm_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION encrypt_llm_key(text) TO service_role;
`;

async function runFix() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to database. Running fix...');
    await client.query(sql);
    console.log('Database fix applied successfully!');
  } catch (err) {
    console.error('Error applying database fix:', err);
  } finally {
    await client.end();
  }
}

runFix();
