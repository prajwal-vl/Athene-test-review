-- ============================================================
-- 010_embedding_content_hash.sql — Per-chunk dedup (ATH-28)
-- ============================================================
-- The embedding pipeline computes SHA-256 over each chunk's text
-- and stores only the hash (never the content). On re-index the
-- pipeline compares hashes to skip unchanged chunks, avoiding
-- wasted embed calls.
--
-- Rule #2: we still never store the chunk body. Only the hash.
-- ============================================================

ALTER TABLE document_embeddings
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Dedup lookup: given a (org, document), which hashes exist?
CREATE INDEX IF NOT EXISTS idx_document_embeddings_hash_lookup
  ON document_embeddings (org_id, document_id, content_hash);
