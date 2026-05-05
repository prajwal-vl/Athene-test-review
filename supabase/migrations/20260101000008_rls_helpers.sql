-- ============================================================
-- 008_rls_helpers.sql — Helper for setting session context
-- ============================================================

CREATE OR REPLACE FUNCTION set_app_context(
  p_org_id text,
  p_user_id text,
  p_dept_id text DEFAULT '',
  p_role text DEFAULT 'member'
)
RETURNS void AS $$
BEGIN
  -- Third arg = true → setting is LOCAL to the current transaction.
  -- Prevents session variable leakage across requests when the
  -- connection pool reuses a connection.
  PERFORM set_config('app.org_id', p_org_id, true);
  PERFORM set_config('app.user_id', p_user_id, true);
  PERFORM set_config('app.department_id', p_dept_id, true);
  PERFORM set_config('app.user_role', p_role, true);
END;
$$ LANGUAGE plpgsql;

-- Ensure service_role can call this
GRANT EXECUTE ON FUNCTION set_app_context(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION set_app_context(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_app_context(text, text, text, text) TO anon;

-- Vector search function
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content_preview text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.document_id,
    de.content_preview,
    de.metadata,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM document_embeddings de
  WHERE 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Session grants helper (temp table for current transaction)
CREATE OR REPLACE FUNCTION set_session_grants(p_grants jsonb)
RETURNS void AS $$
BEGIN
  CREATE TEMPORARY TABLE IF NOT EXISTS session_grants (
    scope_type grant_scope,
    scope_id text
  ) ON COMMIT DROP;
  
  DELETE FROM session_grants;
  
  INSERT INTO session_grants (scope_type, scope_id)
  SELECT (x->>'scope_type')::grant_scope, x->>'scope_id'
  FROM jsonb_array_elements(p_grants) AS x;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION set_session_grants(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION set_session_grants(jsonb) TO authenticated;

-- GRANT Table permissions (PostgREST requires these for RLS to even trigger)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
