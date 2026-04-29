// ============================================================
// Knowledge Graph shared types (ATH-58)
//
// These types mirror the kg_nodes / kg_edges columns and are
// the contract between the extractor (ATH-58) and the storage
// layer (ATH-59).
// ============================================================

export type EntityType =
  | "person"
  | "project"
  | "service"
  | "concept"
  | "team"
  | "technology"
  | "process"
  | "organization"
  | "product";

export type Visibility = "public" | "department" | "private";

/** How we arrived at this edge. */
export type KGProvenance = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

/**
 * Relation types supported by the graph.
 * Open string so adapters can emit novel relations, but these
 * are the canonical ones the UI knows how to render.
 */
export type KGRelation =
  | "DEPENDS_ON"
  | "OWNS"
  | "FEEDS"
  | "MENTIONS"
  | "USES"
  | "RELATED_TO"
  | "PART_OF"
  | "WORKS_ON"
  | (string & {});

/**
 * Chunk passed into the extractor. The body is ephemeral (RAM only).
 * department_id / visibility / org_id / document_id are carried
 * forward onto every emitted node and edge.
 */
export type ExtractorChunk = {
  text: string;
  chunk_index: number;
  org_id: string;
  document_id: string;
  department_id?: string | null;
  visibility: Visibility;
};

/** A node to be upserted into kg_nodes. */
export type KGNode = {
  org_id: string;
  label: string;
  entity_type: EntityType | (string & {});
  department_ids: string[];
  visibility: Visibility;
  source_documents: string[];
  description?: string | null;
  metadata?: Record<string, unknown>;
  updated_at?: string;
};

/** An edge to be upserted into kg_edges. Source/target are labels, not UUIDs. */
export type KGEdge = {
  org_id: string;
  source_label: string;
  source_entity_type: EntityType | (string & {});
  target_label: string;
  target_entity_type: EntityType | (string & {});
  relation: KGRelation;
  provenance: KGProvenance;
  confidence: number;
  source_document?: string | null;
  department_id?: string | null;
  visibility: Visibility;
  metadata?: Record<string, unknown>;
};

/** Result of an extraction pass. */
export type ExtractionResult = {
  nodes: KGNode[];
  edges: KGEdge[];
};
