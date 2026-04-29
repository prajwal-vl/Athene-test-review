// ============================================================
// storage.ts — kg_nodes / kg_edges write layer (ATH-59)
//
// Upsert logic matches the UNIQUE constraints on the two tables:
//   kg_nodes:  UNIQUE (org_id, label, entity_type)
//   kg_edges:  UNIQUE (org_id, source_node, target_node, relation)
//
// On conflict we MERGE array columns (department_ids,
// source_documents) rather than replace, and we upgrade
// provenance / confidence rather than overwrite.
//
// All writes run inside withRLS() so org isolation is enforced.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { withRLS, type RLSContext } from "@/lib/supabase/rls-client";
import type { KGEdge, KGNode, KGProvenance } from "./types";
import { strongerProvenance, unionStrings } from "./extractor";

// ---- Node upsert ----------------------------------------------

/**
 * Upsert nodes into kg_nodes. For each incoming node:
 *  - If a node with the same (org_id, label, entity_type) already
 *    exists, merge department_ids and source_documents, upgrade
 *    visibility if needed, and fill in description if missing.
 *  - Otherwise insert a fresh row.
 *
 * Returns a map of (label::entity_type) → uuid so callers can
 * build the edge table from labels.
 */
export async function upsertNodes(
  ctx: RLSContext,
  nodes: KGNode[]
): Promise<Map<string, string>> {
  return withRLS(ctx, async (supabase) => {
    if (nodes.length === 0) return new Map();
    // 1. Fetch any existing rows for the incoming (label, entity_type) pairs
    const labels = Array.from(new Set(nodes.map((n) => n.label)));
    const { data: existingRows, error: fetchErr } = await supabase
      .from("kg_nodes")
      .select(
        "id, label, entity_type, department_ids, source_documents, visibility, description"
      )
      .eq("org_id", ctx.org_id)
      .in("label", labels);

    if (fetchErr) throw new Error(`kg_nodes fetch failed: ${fetchErr.message}`);

    const existingByKey = new Map<string, ExistingNode>();
    for (const row of (existingRows ?? []) as ExistingNode[]) {
      existingByKey.set(nodeKey(row.label, row.entity_type), row);
    }

    // 2. Split into update vs insert
    const toInsert: KGNode[] = [];
    const toUpdate: Array<{ id: string; patch: Partial<ExistingNode> }> = [];

    for (const n of nodes) {
      const key = nodeKey(n.label, n.entity_type);
      const existing = existingByKey.get(key);
      if (!existing) {
        toInsert.push(n);
        continue;
      }
      const mergedDeptIds = unionStrings(existing.department_ids ?? [], n.department_ids);
      const mergedDocs = unionStrings(existing.source_documents ?? [], n.source_documents);
      const mergedVisibility = maxVisibilityRaw(existing.visibility, n.visibility);
      const patch: Partial<ExistingNode> = {};

      if (!arraysEqual(existing.department_ids ?? [], mergedDeptIds)) {
        patch.department_ids = mergedDeptIds;
      }
      if (!arraysEqual(existing.source_documents ?? [], mergedDocs)) {
        patch.source_documents = mergedDocs;
      }
      if (existing.visibility !== mergedVisibility) {
        patch.visibility = mergedVisibility;
      }
      if (!existing.description && n.description) {
        patch.description = n.description;
      }

      if (Object.keys(patch).length > 0) {
        toUpdate.push({ id: existing.id, patch });
      }
    }

    // 3. Apply updates one-by-one (Supabase has no bulk-different-rows API)
    for (const { id, patch } of toUpdate) {
      const { error } = await supabase.from("kg_nodes").update(patch).eq("id", id);
      if (error) throw new Error(`kg_nodes update failed: ${error.message}`);
    }

    // 4. Bulk insert new rows
    let insertedRows: Array<{ id: string; label: string; entity_type: string }> = [];
    if (toInsert.length > 0) {
      const payload = toInsert.map((n) => ({
        org_id: n.org_id,
        label: n.label,
        entity_type: n.entity_type,
        department_ids: n.department_ids,
        visibility: n.visibility,
        source_documents: n.source_documents,
        description: n.description ?? null,
        metadata: n.metadata ?? {},
      }));
      const { data, error } = await supabase
        .from("kg_nodes")
        .insert(payload)
        .select("id, label, entity_type");
      if (error) throw new Error(`kg_nodes insert failed: ${error.message}`);
      insertedRows = data ?? [];
    }

    // 5. Build the full label→id map (existing + inserted)
    const idMap = new Map<string, string>();
    for (const row of existingByKey.values()) {
      idMap.set(nodeKey(row.label, row.entity_type), row.id);
    }
    for (const row of insertedRows) {
      idMap.set(nodeKey(row.label, row.entity_type), row.id);
    }
    return idMap;
  });
}

// ---- Edge upsert ----------------------------------------------

/**
 * Upsert edges into kg_edges. Requires a label→id map from
 * upsertNodes() so we can resolve source/target UUIDs. Edges whose
 * endpoints are missing from the map are silently skipped.
 *
 * Conflict policy:
 *   - provenance: never downgraded (EXTRACTED > INFERRED > AMBIGUOUS)
 *   - confidence: kept at GREATEST
 */
export async function upsertEdges(
  ctx: RLSContext,
  edges: KGEdge[],
  nodeIdMap: Map<string, string>
): Promise<void> {
  await withRLS(ctx, async (supabase) => {
    if (edges.length === 0) return;
    // Resolve label→id. Skip edges whose endpoints weren't upserted.
    type Resolved = {
      org_id: string;
      source_node: string;
      target_node: string;
      relation: string;
      provenance: KGProvenance;
      confidence: number;
      source_document: string | null;
      department_id: string | null;
      visibility: string;
      metadata: Record<string, unknown>;
    };

    const resolved: Resolved[] = [];
    for (const e of edges) {
      const sId = nodeIdMap.get(nodeKey(e.source_label, e.source_entity_type));
      const tId = nodeIdMap.get(nodeKey(e.target_label, e.target_entity_type));
      if (!sId || !tId) continue;
      resolved.push({
        org_id: e.org_id,
        source_node: sId,
        target_node: tId,
        relation: e.relation,
        provenance: e.provenance,
        confidence: e.confidence,
        source_document: e.source_document ?? null,
        department_id: e.department_id ?? null,
        visibility: e.visibility,
        metadata: e.metadata ?? {},
      });
    }
    if (resolved.length === 0) return;

    // Fetch existing edges that collide on the unique key
    const pairs = resolved.map((r) => ({
      source_node: r.source_node,
      target_node: r.target_node,
      relation: r.relation,
    }));
    const sourceIds = Array.from(new Set(pairs.map((p) => p.source_node)));
    const targetIds = Array.from(new Set(pairs.map((p) => p.target_node)));

    const { data: existing, error: fetchErr } = await supabase
      .from("kg_edges")
      .select("id, source_node, target_node, relation, provenance, confidence")
      .eq("org_id", ctx.org_id)
      .in("source_node", sourceIds)
      .in("target_node", targetIds);
    if (fetchErr) throw new Error(`kg_edges fetch failed: ${fetchErr.message}`);

    const existingByKey = new Map<string, ExistingEdge>();
    for (const row of (existing ?? []) as ExistingEdge[]) {
      existingByKey.set(edgeKey(row.source_node, row.target_node, row.relation), row);
    }

    const toInsert: Resolved[] = [];
    const toUpdate: Array<{ id: string; provenance: KGProvenance; confidence: number }> = [];

    for (const r of resolved) {
      const key = edgeKey(r.source_node, r.target_node, r.relation);
      const match = existingByKey.get(key);
      if (!match) {
        toInsert.push(r);
        continue;
      }
      const newProvenance = strongerProvenance(match.provenance, r.provenance);
      const newConfidence = Math.max(match.confidence, r.confidence);
      if (newProvenance !== match.provenance || newConfidence !== match.confidence) {
        toUpdate.push({
          id: match.id,
          provenance: newProvenance,
          confidence: newConfidence,
        });
      }
    }

    for (const u of toUpdate) {
      const { error } = await supabase
        .from("kg_edges")
        .update({ provenance: u.provenance, confidence: u.confidence })
        .eq("id", u.id);
      if (error) throw new Error(`kg_edges update failed: ${error.message}`);
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("kg_edges").insert(toInsert);
      if (error) throw new Error(`kg_edges insert failed: ${error.message}`);
    }
  });
}

// ---- Delete by document ---------------------------------------

/**
 * Clean up graph contributions from a single document.
 *
 * - Nodes whose `source_documents` equals `[documentId]` are deleted
 *   outright (they have no other contributors). kg_edges referencing
 *   them cascade via the FK.
 * - Nodes mentioned by other docs have `documentId` removed from
 *   `source_documents` but otherwise survive.
 * - Edges whose `source_document = documentId` are deleted (they
 *   belong to this doc). Edges inferred from multiple docs are not
 *   tagged with a single source and are left alone.
 */
export async function deleteByDocument(
  ctx: RLSContext,
  documentId: string
): Promise<void> {
  await withRLS(ctx, async (supabase) => {
    if (!documentId) throw new Error("documentId is required");
    // 1. Load nodes that reference this doc
    const { data: nodes, error: fetchErr } = await supabase
      .from("kg_nodes")
      .select("id, source_documents")
      .eq("org_id", ctx.org_id)
      .contains("source_documents", [documentId]);
    if (fetchErr) throw new Error(`kg_nodes fetch failed: ${fetchErr.message}`);

    const orphanIds: string[] = [];
    const sharedNodes: Array<{ id: string; remaining: string[] }> = [];

    for (const row of (nodes ?? []) as Array<{ id: string; source_documents: string[] }>) {
      const remaining = (row.source_documents ?? []).filter((d) => d !== documentId);
      if (remaining.length === 0) {
        orphanIds.push(row.id);
      } else {
        sharedNodes.push({ id: row.id, remaining });
      }
    }

    // 2. Delete orphan nodes (edges cascade)
    if (orphanIds.length > 0) {
      const { error } = await supabase.from("kg_nodes").delete().in("id", orphanIds);
      if (error) throw new Error(`kg_nodes delete failed: ${error.message}`);
    }

    // 3. Update shared nodes — drop this doc from source_documents
    for (const n of sharedNodes) {
      const { error } = await supabase
        .from("kg_nodes")
        .update({ source_documents: n.remaining })
        .eq("id", n.id);
      if (error) throw new Error(`kg_nodes shared update failed: ${error.message}`);
    }

    // 4. Delete edges tagged with this doc as their sole source
    const { error: edgeErr } = await supabase
      .from("kg_edges")
      .delete()
      .eq("org_id", ctx.org_id)
      .eq("source_document", documentId);
    if (edgeErr) throw new Error(`kg_edges delete failed: ${edgeErr.message}`);
  });
}

// ---- Internals ------------------------------------------------

type ExistingNode = {
  id: string;
  label: string;
  entity_type: string;
  department_ids: string[] | null;
  source_documents: string[] | null;
  visibility: string;
  description: string | null;
};

type ExistingEdge = {
  id: string;
  source_node: string;
  target_node: string;
  relation: string;
  provenance: KGProvenance;
  confidence: number;
};

export function nodeKey(label: string, entityType: string): string {
  return `${label}::${entityType}`;
}

function edgeKey(source: string, target: string, relation: string): string {
  return `${source}->${relation}->${target}`;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...a].sort();
  const other = [...b].sort();
  for (let i = 0; i < sorted.length; i++) if (sorted[i] !== other[i]) return false;
  return true;
}

// Mirror of maxVisibility from extractor but operates on raw strings
// (kg_nodes.visibility is `visibility_level` enum — we treat the DB
// value as authoritative and never widen to "public" accidentally).
const VISIBILITY_RANK: Record<string, number> = {
  private: 0,
  department: 1,
  public: 2,
};

function maxVisibilityRaw(a: string, b: string): string {
  return (VISIBILITY_RANK[a] ?? 0) >= (VISIBILITY_RANK[b] ?? 0) ? a : b;
}

// Export a suitable supabase client type for tests that want it
export type { SupabaseClient };
