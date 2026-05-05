-- ============================================================
-- 003_indexes.sql — Performance indexes for all tables
-- ============================================================

-- Organizations
CREATE INDEX idx_organizations_clerk_org ON organizations(clerk_org_id);

-- Departments
CREATE INDEX idx_departments_org ON departments(org_id);

-- Org Members
CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_org_members_clerk_user ON org_members(clerk_user_id);
CREATE INDEX idx_org_members_dept ON org_members(org_id, department_id);
CREATE INDEX idx_org_members_role ON org_members(org_id, role);
CREATE INDEX idx_org_members_active ON org_members(org_id, active) WHERE active = true;

-- Access Grants
CREATE INDEX idx_access_grants_user ON access_grants(org_id, user_id);
-- Cannot use now() in partial index predicate (STABLE, not IMMUTABLE).
-- Include expires_at in the index; filter at query time.
CREATE INDEX idx_access_grants_active ON access_grants(org_id, user_id, expires_at);

-- Connections
CREATE INDEX idx_connections_org ON connections(org_id);
CREATE INDEX idx_connections_user ON connections(org_id, user_id);
CREATE INDEX idx_connections_provider ON connections(org_id, provider);
CREATE INDEX idx_connections_status ON connections(org_id, status);

-- Documents
CREATE INDEX idx_documents_org ON documents(org_id);
CREATE INDEX idx_documents_connection ON documents(connection_id);
CREATE INDEX idx_documents_dept ON documents(org_id, department_id);
CREATE INDEX idx_documents_owner ON documents(org_id, owner_user_id);
CREATE INDEX idx_documents_visibility ON documents(org_id, visibility);
CREATE INDEX idx_documents_source ON documents(org_id, source_type);
CREATE INDEX idx_documents_external ON documents(org_id, connection_id, external_id);
CREATE INDEX idx_documents_content_hash ON documents(content_hash);
CREATE INDEX idx_documents_last_indexed ON documents(org_id, last_indexed_at);

-- Document Embeddings (non-vector indexes — vector index in 004)
CREATE INDEX idx_embeddings_org ON document_embeddings(org_id);
CREATE INDEX idx_embeddings_doc ON document_embeddings(document_id);
CREATE INDEX idx_embeddings_dept ON document_embeddings(org_id, department_id);
CREATE INDEX idx_embeddings_owner ON document_embeddings(org_id, owner_user_id);
CREATE INDEX idx_embeddings_visibility ON document_embeddings(org_id, visibility);
CREATE INDEX idx_embeddings_source ON document_embeddings(org_id, source_type);

-- Knowledge Graph Nodes
CREATE INDEX idx_kg_nodes_org ON kg_nodes(org_id);
CREATE INDEX idx_kg_nodes_type ON kg_nodes(org_id, entity_type);
CREATE INDEX idx_kg_nodes_community ON kg_nodes(org_id, community);
CREATE INDEX idx_kg_nodes_label_trgm ON kg_nodes USING gin (label gin_trgm_ops);
CREATE INDEX idx_kg_nodes_dept_ids ON kg_nodes USING gin (department_ids);
CREATE INDEX idx_kg_nodes_source_docs ON kg_nodes USING gin (source_documents);

-- Knowledge Graph Edges
CREATE INDEX idx_kg_edges_org ON kg_edges(org_id);
CREATE INDEX idx_kg_edges_source ON kg_edges(source_node);
CREATE INDEX idx_kg_edges_target ON kg_edges(target_node);
CREATE INDEX idx_kg_edges_relation ON kg_edges(org_id, relation);
CREATE INDEX idx_kg_edges_dept ON kg_edges(org_id, department_id);
-- Composite for graph traversal (find all edges from a node)
CREATE INDEX idx_kg_edges_traverse ON kg_edges(org_id, source_node, relation);

-- Threads
CREATE INDEX idx_threads_org_user ON threads(org_id, user_id);
CREATE INDEX idx_threads_last_message ON threads(org_id, user_id, last_message_at DESC);

-- Thread Checkpoints
CREATE INDEX idx_checkpoints_thread ON thread_checkpoints(thread_id);
CREATE INDEX idx_checkpoints_created ON thread_checkpoints(thread_id, created_at DESC);

-- HITL Decisions
CREATE INDEX idx_hitl_thread ON hitl_decisions(thread_id);
CREATE INDEX idx_hitl_user ON hitl_decisions(org_id, user_id);

-- Grant Access Audit
CREATE INDEX idx_grant_audit_org ON grant_access_audit(org_id);
CREATE INDEX idx_grant_audit_user ON grant_access_audit(org_id, user_id);
CREATE INDEX idx_grant_audit_time ON grant_access_audit(org_id, accessed_at DESC);

-- Admin Actions
CREATE INDEX idx_admin_actions_org ON admin_actions(org_id);
CREATE INDEX idx_admin_actions_time ON admin_actions(org_id, performed_at DESC);
CREATE INDEX idx_admin_actions_target ON admin_actions(org_id, target_user_id);
