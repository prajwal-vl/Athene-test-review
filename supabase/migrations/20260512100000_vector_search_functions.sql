-- ============================================================
-- 20260512100000_vector_search_functions.sql
-- Replaces the vector_search and vector_search_cross_dept
-- functions from 008_rls_helpers.sql with versions whose
-- signatures match the actual RPC call sites in the codebase.
--
-- The call sites in lib/tools/vector-search.ts pass ONLY
-- p_embedding and p_limit — org/user identity is read from the
-- session context set by initialize_secure_session() which is
-- called by withRLS() before every query.
-- ============================================================

-- vector_search: org-scoped semantic search using session context
CREATE OR REPLACE FUNCTION vector_search(
  p_embedding vector(1536),
  p_limit     int DEFAULT 5
)
RETURNS TABLE (
  chunk_id         uuid,
  document_id      uuid,
  content_preview  text,
  metadata         jsonb,
  similarity       float
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := (current_setting('app.org_id', true))::uuid;

  RETURN QUERY
  SELECT
    de.id                              AS chunk_id,
    de.document_id,
    de.content_preview,
    de.metadata,
    1 - (de.embedding <=> p_embedding) AS similarity
  FROM document_embeddings de
  WHERE de.org_id = v_org_id
    AND 1 - (de.embedding <=> p_embedding) > 0.5
  ORDER BY de.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION vector_search(vector, int) TO service_role, authenticated;

-- vector_search_cross_dept: cross-department search using session context
-- Intended for super_user / admin roles — no visibility filter applied,
-- allowing access to all visibility levels within the org.
CREATE OR REPLACE FUNCTION vector_search_cross_dept(
  p_embedding vector(1536),
  p_limit     int DEFAULT 20
)
RETURNS TABLE (
  chunk_id         uuid,
  document_id      uuid,
  content_preview  text,
  metadata         jsonb,
  similarity       float
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := (current_setting('app.org_id', true))::uuid;

  RETURN QUERY
  SELECT
    de.id                              AS chunk_id,
    de.document_id,
    de.content_preview,
    de.metadata,
    1 - (de.embedding <=> p_embedding) AS similarity
  FROM document_embeddings de
  WHERE de.org_id = v_org_id
  ORDER BY de.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION vector_search_cross_dept(vector, int) TO service_role, authenticated;
