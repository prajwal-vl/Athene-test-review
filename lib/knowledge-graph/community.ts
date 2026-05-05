// ============================================================
// knowledge-graph/community.ts — Community detection (ATH-60)
//
// After all documents are processed, run a connected-components
// pass to assign community IDs to kg_nodes.
//
// Algorithm: union-find (disjoint sets) over kg_edges.
// Nodes in the same connected component get the same community ID.
// Community IDs are stable strings (lowest node ID in the group).
//
// Written as a service-role operation — bypasses RLS since it
// reads/writes across the full org graph.
// ============================================================

import { supabaseAdmin } from '@/lib/supabase/server'

// ---- Union-Find ---------------------------------------------

class UnionFind {
  private parent: Map<string, string> = new Map()

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    const p = this.parent.get(x)!
    if (p !== x) {
      const root = this.find(p)
      this.parent.set(x, root) // path compression
      return root
    }
    return x
  }

  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) {
      // Deterministic: always attach higher to lower so community ID = min node ID
      if (ra < rb) {
        this.parent.set(rb, ra)
      } else {
        this.parent.set(ra, rb)
      }
    }
  }

  getRoots(): Map<string, string> {
    const roots = new Map<string, string>()
    for (const id of this.parent.keys()) {
      roots.set(id, this.find(id))
    }
    return roots
  }
}

// ---- Main function ------------------------------------------

/**
 * Assigns community IDs to all kg_nodes for the given org.
 * Runs a connected-components pass over kg_edges.
 * Each node gets community = root node ID of its component.
 */
export async function detectCommunities(orgId: string): Promise<void> {
  // 1. Load all node IDs
  const { data: nodes, error: nodeErr } = await supabaseAdmin
    .from('kg_nodes')
    .select('id')
    .eq('org_id', orgId)

  if (nodeErr) throw new Error(`[community] Failed to load nodes: ${nodeErr.message}`)
  if (!nodes || nodes.length === 0) return

  // 2. Load all edges
  const { data: edges, error: edgeErr } = await supabaseAdmin
    .from('kg_edges')
    .select('source_node, target_node')
    .eq('org_id', orgId)

  if (edgeErr) throw new Error(`[community] Failed to load edges: ${edgeErr.message}`)

  // 3. Build union-find from edges
  const uf = new UnionFind()

  // Initialise all node IDs
  for (const { id } of nodes) {
    uf.find(id) // initialises parent[id] = id
  }

  // Union connected nodes
  for (const edge of edges ?? []) {
    uf.union(edge.source_node, edge.target_node)
  }

  // 4. Build community assignment map: nodeId → communityId
  const assignments = uf.getRoots()

  // 5. Group nodes by community for batch updates
  const byCommunity = new Map<string, string[]>()
  for (const [nodeId, communityId] of assignments) {
    if (!byCommunity.has(communityId)) byCommunity.set(communityId, [])
    byCommunity.get(communityId)!.push(nodeId)
  }

  // 6. Update kg_nodes.community in batches per community
  const batchSize = 100
  for (const [communityId, memberIds] of byCommunity) {
    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize)
      const { error } = await supabaseAdmin
        .from('kg_nodes')
        .update({ community: communityId })
        .eq('org_id', orgId)
        .in('id', batch)

      if (error) {
        console.error(`[community] Update failed for community ${communityId}:`, error.message)
      }
    }
  }
}
