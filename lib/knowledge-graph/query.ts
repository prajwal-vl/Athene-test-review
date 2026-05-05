// ============================================================
// query.ts — kg_nodes / kg_edges read layer (ATH-61)
//
// All reads run inside withRLS() so org isolation is enforced.
// ============================================================

import { withRLS, type RLSContext } from "@/lib/supabase/rls-client";
import type { KGNode } from "./types";

export type GraphNode = KGNode & { 
  id: string; 
  community?: string; 
  updated_at?: string; 
};

export type GraphEdge = {
  id: string;
  org_id: string;
  source_node: string;
  target_node: string;
  relation: string;
  provenance: string;
  confidence: number;
  source_document?: string | null;
  department_id?: string | null;
  visibility: string;
  metadata?: Record<string, unknown>;
  updated_at?: string;
};

export type QueryResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  boundary_reached: boolean;
  truncated?: boolean;
};

/**
 * Find nodes by label or description (case-insensitive).
 * Uses PostgREST ilike for prefix/infix matches. While this can utilize
 * the gin_trgm index, it is not a true similarity() search.
 */
export async function searchNodes(
  ctx: RLSContext,
  query: string,
  limit = 20
): Promise<QueryResult> {
  return withRLS(ctx, async (supabase) => {
    if (!query.trim()) return { nodes: [], edges: [], boundary_reached: false };

    const { data, error } = await supabase
      .from("kg_nodes")
      .select("*")
      .eq("org_id", ctx.org_id)
      .or(`label.ilike."%${query}%",description.ilike."%${query}%"`)
      .limit(limit);

    if (error) throw new Error(`searchNodes failed: ${error.message}`);
    const nodes = (data ?? []) as GraphNode[];
    return {
      nodes,
      edges: [],
      boundary_reached: false,
      truncated: nodes.length >= limit,
    };
  });
}

/**
 * Filtered search for nodes.
 * Uses PostgREST ilike for prefix/infix matches on the label column.
 * Optimized by the gin_trgm index, but performs string matching rather than similarity search.
 */
export async function findNodes(
  ctx: RLSContext,
  filters: {
    labels?: string[];
    entityTypes?: string[];
    query?: string;
  },
  limit = 50
): Promise<QueryResult> {
  return withRLS(ctx, async (supabase) => {
    let q = supabase.from("kg_nodes").select("*").eq("org_id", ctx.org_id);

    if (filters.query?.trim()) {
      q = q.ilike("label", `%${filters.query.trim()}%`);
    }
    if (filters.labels && filters.labels.length > 0) {
      q = q.in("label", filters.labels);
    }
    if (filters.entityTypes && filters.entityTypes.length > 0) {
      q = q.in("entity_type", filters.entityTypes);
    }

    const { data, error } = await q.limit(limit);

    if (error) throw new Error(`findNodes failed: ${error.message}`);
    const nodes = (data ?? []) as GraphNode[];
    return {
      nodes,
      edges: [],
      boundary_reached: false,
      truncated: nodes.length >= limit,
    };
  });
}

/**
 * Multi-hop BFS traversal starting from a specific node.
 * Returns the discovered subgraph (nodes and edges).
 */
export async function traverseFromNode(
  ctx: RLSContext,
  nodeId: string,
  options: {
    maxHops?: number;
    relationFilter?: string[];
  } = {}
): Promise<QueryResult> {
  const { maxHops = 3, relationFilter } = options;

  return withRLS(ctx, async (supabase) => {
    const discoveredNodes = new Map<string, GraphNode>();
    const discoveredEdges = new Map<string, GraphEdge>();
    
    const { data: startNode, error: startErr } = await supabase
      .from("kg_nodes")
      .select("*")
      .eq("id", nodeId)
      .maybeSingle();

    if (startErr) throw new Error(`Traversal start failed: ${startErr.message}`);
    if (!startNode) return { nodes: [], edges: [], boundary_reached: false };

    discoveredNodes.set(nodeId, startNode as GraphNode);

    let currentHopNodes = [nodeId];
    let visited = new Set<string>([nodeId]);
    let boundary_reached = false;

    for (let hop = 0; hop < maxHops; hop++) {
      if (currentHopNodes.length === 0) break;

      let query = supabase
        .from("kg_edges")
        .select("*, source:kg_nodes!source_node(*), target:kg_nodes!target_node(*)")
        .or(`source_node.in.(${currentHopNodes.map(id => `"${id}"`).join(",")}),target_node.in.(${currentHopNodes.map(id => `"${id}"`).join(",")})`);

      if (relationFilter && relationFilter.length > 0) {
        query = query.in("relation", relationFilter);
      }

      const { data: edges, error: edgeErr } = await query;
      if (edgeErr) throw new Error(`Traversal hop ${hop} failed: ${edgeErr.message}`);

      const nextHopNodes: string[] = [];

      for (const e of edges ?? []) {
        const { source, target, ...edgeData } = e;
        discoveredEdges.set(e.id, edgeData as GraphEdge);

        const neighbors = [
          { id: e.source_node, data: source },
          { id: e.target_node, data: target },
        ];

        for (const n of neighbors) {
          if (n.data) {
            if (!discoveredNodes.has(n.id)) {
              discoveredNodes.set(n.id, n.data as GraphNode);
              if (!visited.has(n.id)) {
                nextHopNodes.push(n.id);
                visited.add(n.id);
              }
            }
          } else {
            // Edge exists but node is missing (likely RLS-blocked)
            boundary_reached = true;
          }
        }
      }

      currentHopNodes = nextHopNodes;
      if (hop === maxHops - 1 && currentHopNodes.length > 0) {
        boundary_reached = true;
      }
    }

    return {
      nodes: Array.from(discoveredNodes.values()),
      edges: Array.from(discoveredEdges.values()),
      boundary_reached,
    };
  });
}

/**
 * Get a single node by its UUID.
 */
export async function getNodeById(
  ctx: RLSContext,
  id: string
): Promise<QueryResult> {
  return withRLS(ctx, async (supabase) => {
    const { data, error } = await supabase
      .from("kg_nodes")
      .select("*")
      .eq("org_id", ctx.org_id)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`getNodeById failed: ${error.message}`);
    return {
      nodes: data ? [data as GraphNode] : [],
      edges: [],
      boundary_reached: false,
    };
  });
}

/**
 * Get a single node by its label and entity type.
 */
export async function getNodeByLabel(
  ctx: RLSContext,
  label: string,
  entityType: string
): Promise<QueryResult> {
  return withRLS(ctx, async (supabase) => {
    const { data, error } = await supabase
      .from("kg_nodes")
      .select("*")
      .eq("org_id", ctx.org_id)
      .eq("label", label)
      .eq("entity_type", entityType)
      .maybeSingle();

    if (error) throw new Error(`getNodeByLabel failed: ${error.message}`);
    return {
      nodes: data ? [data as GraphNode] : [],
      edges: [],
      boundary_reached: false,
    };
  });
}

/**
 * Get all neighbors (1-hop) for a node. Returns both outbound
 * and inbound edges with the corresponding neighbor node.
 */
export async function getNeighbors(
  ctx: RLSContext,
  nodeId: string
): Promise<QueryResult> {
  return withRLS(ctx, async (supabase) => {
    const { data: edgesWithNodes, error: edgeErr } = await supabase
      .from("kg_edges")
      .select("*, source:kg_nodes!source_node(*), target:kg_nodes!target_node(*)")
      .eq("org_id", ctx.org_id)
      .or(`source_node.eq."${nodeId}",target_node.eq."${nodeId}"`);

    if (edgeErr) throw new Error(`getNeighbors fetch failed: ${edgeErr.message}`);

    const discoveredNodes = new Map<string, GraphNode>();
    const discoveredEdges = new Map<string, GraphEdge>();
    let boundary_reached = false;

    for (const e of edgesWithNodes ?? []) {
      const { source, target, ...edgeData } = e;
      discoveredEdges.set(e.id, edgeData as GraphEdge);
      
      if (source) {
        discoveredNodes.set(e.source_node, source as GraphNode);
      } else if (e.source_node !== nodeId) {
        boundary_reached = true;
      }

      if (target) {
        discoveredNodes.set(e.target_node, target as GraphNode);
      } else if (e.target_node !== nodeId) {
        boundary_reached = true;
      }
    }

    return {
      nodes: Array.from(discoveredNodes.values()),
      edges: Array.from(discoveredEdges.values()),
      boundary_reached,
    };
  });
}

/**
 * Get the most recently updated nodes in the graph.
 */
export async function getRecentNodes(
  ctx: RLSContext,
  limit = 10
): Promise<QueryResult> {
  return withRLS(ctx, async (supabase) => {
    const { data, error } = await supabase
      .from("kg_nodes")
      .select("*")
      .eq("org_id", ctx.org_id)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`getRecentNodes failed: ${error.message}`);
    return {
      nodes: (data ?? []) as GraphNode[],
      edges: [],
      boundary_reached: false,
    };
  });
}

/**
 * Get all nodes belonging to a specific community (Leiden cluster).
 */
export async function getCommunity(
  ctx: RLSContext,
  communityId: string
): Promise<QueryResult> {
  return withRLS(ctx, async (supabase) => {
    const { data, error } = await supabase
      .from("kg_nodes")
      .select("*")
      .eq("org_id", ctx.org_id)
      .eq("community", communityId);

    if (error) throw new Error(`getCommunity failed: ${error.message}`);
    const nodes = (data ?? []) as GraphNode[];
    const nodeIds = nodes.map(n => n.id);

    if (nodeIds.length === 0) {
      return { nodes: [], edges: [], boundary_reached: false };
    }

    // Fetch intra-community edges
    const { data: edges, error: edgeErr } = await supabase
      .from("kg_edges")
      .select("*")
      .eq("org_id", ctx.org_id)
      .in("source_node", nodeIds)
      .in("target_node", nodeIds);

    if (edgeErr) throw new Error(`getCommunity edges failed: ${edgeErr.message}`);

    return {
      nodes,
      edges: (edges ?? []) as GraphEdge[],
      boundary_reached: false,
    };
  });
}
