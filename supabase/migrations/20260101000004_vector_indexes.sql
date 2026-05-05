-- ============================================================
-- 004_vector_indexes.sql — HNSW vector index on embeddings
-- ============================================================
-- Using HNSW (not IVFFlat) for better recall at query time.
-- Operator: <=> (cosine distance) matching text-embedding-3-small.
--
-- m = 16: connections per layer (default, good balance)
-- ef_construction = 200: build-time beam width (higher = better recall, slower build)
--
-- This index is the single most important performance knob
-- for retrieval latency. Target: p95 < 300ms for top-8 query.
-- ============================================================

-- Main embedding search index
CREATE INDEX idx_embeddings_hnsw ON document_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- ============================================================
-- Set search-time ef parameter
-- ============================================================
-- ef = 100 at search time gives good recall without excessive latency.
-- Can be tuned per-session with: SET LOCAL hnsw.ef_search = 200;

-- ALTER DATABASE needs a literal identifier; use DO block so it
-- works regardless of the database name (local vs remote).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET hnsw.ef_search = 100', current_database());
END
$$;

-- ============================================================
-- Partial indexes for common filtered queries
-- ============================================================
-- These help when filtering by org_id + visibility before vector search.
-- pgvector will use these for pre-filtered scans.

-- Org-scoped embedding search (most common path)
CREATE INDEX idx_embeddings_org_hnsw ON document_embeddings(org_id)
  INCLUDE (embedding);

-- Visibility-filtered scan helper
CREATE INDEX idx_embeddings_org_vis ON document_embeddings(org_id, visibility);

-- Department-filtered scan helper
CREATE INDEX idx_embeddings_org_dept ON document_embeddings(org_id, department_id, visibility);
