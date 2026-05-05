// ============================================================
// query.test.ts — ATH-61 knowledge graph query layer tests
//
// In-memory Supabase stub backs `withRLS` to verify read logic.
// All functions now return { nodes, edges, boundary_reached }.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- In-memory tables -----------------------------------------
type NodeRow = {
  id: string;
  org_id: string;
  label: string;
  entity_type: string;
  department_ids: string[];
  source_documents: string[];
  visibility: string;
  description: string | null;
  updated_at: string;
  community?: string;
};

type EdgeRow = {
  id: string;
  org_id: string;
  source_node: string;
  target_node: string;
  relation: string;
  provenance: string;
  confidence: number;
};

const nodes: NodeRow[] = [];
const edges: EdgeRow[] = [];
let idCounter = 0;

// Current Context (simulating RLS session)
const ctx = {
  org_id: "org-1",
  user_id: "user-1",
  user_role: "member" as "member" | "admin" | "super_user",
  department_id: "dept-sales",
};

// ---- Mock withRLS to call directly with the stub --------------
vi.mock("@/lib/supabase/rls-client", () => {
  return {
    withRLS: async <T,>(
      _ctx: any,
      cb: (sb: any) => Promise<T>
    ): Promise<T> => cb(makeStub(_ctx)),
  };
});

function makeStub(activeCtx: any) {
  return {
    from(table: "kg_nodes" | "kg_edges") {
      return queryBuilder(table, activeCtx);
    },
    rpc(fn: string, params: any) {
      // Mock RPCs if needed
      return { data: [], error: null };
    }
  };
}

function queryBuilder(table: "kg_nodes" | "kg_edges", activeCtx: any) {
  type Filter =
    | { kind: "eq"; col: string; val: unknown }
    | { kind: "in"; col: string; val: unknown[] }
    | { kind: "or"; query: string }
    | { kind: "ilike"; col: string; val: string }
    | { kind: "limit"; count: number }
    | { kind: "order"; col: string; ascending: boolean };

  const filters: Filter[] = [];
  let isMaybeSingle = false;

  const builder: Record<string, any> = {};
  builder.select = (_cols: string) => builder;
  builder.eq = (col: string, val: unknown) => {
    filters.push({ kind: "eq", col, val });
    return builder;
  };
  builder.in = (col: string, val: unknown[]) => {
    filters.push({ kind: "in", col, val });
    return builder;
  };
  builder.or = (query: string) => {
    filters.push({ kind: "or", query });
    return builder;
  };
  builder.ilike = (col: string, val: string) => {
    filters.push({ kind: "ilike", col, val });
    return builder;
  };
  builder.limit = (count: number) => {
    filters.push({ kind: "limit", count });
    return builder;
  };
  builder.order = (col: string, { ascending }: { ascending: boolean }) => {
    filters.push({ kind: "order", col, ascending });
    return builder;
  };
  builder.maybeSingle = () => {
    isMaybeSingle = true;
    return builder;
  };

  const exec = async () => {
    const dataset = table === "kg_nodes" ? nodes : edges;
    let results = [...dataset] as any[];

    // console.log(`[Stub ${table}] Initial count:`, results.length);

    // ---- Apply RLS Filtering (Simulating Postgres Policies) ----
    if (table === "kg_nodes") {
      results = results.filter((r) => {
        if (r.org_id !== activeCtx.org_id) return false;
        if (activeCtx.user_role === "admin") return true;
        if (r.visibility === "org_wide" || r.visibility === "public") return true;
        if (activeCtx.department_id && r.department_ids && r.department_ids.includes(activeCtx.department_id)) {
          return ["department", "bi_accessible"].includes(r.visibility);
        }
        if (activeCtx.user_role === "super_user") {
          const hasGrant = activeCtx.accessible_dept_ids?.some((id: string) => r.department_ids?.includes(id));
          if (hasGrant && r.visibility !== "confidential") return true;
        }
        return false;
      });
    } else {
      results = results.filter((r) => {
        if (r.org_id !== activeCtx.org_id) return false;
        if (activeCtx.user_role === "admin") return true;
        const vis = r.visibility || "org_wide";
        if (vis === "org_wide" || vis === "public") return true;
        if (r.department_id === activeCtx.department_id) {
          return ["department", "bi_accessible"].includes(vis);
        }
        return false;
      });
    }

    // console.log(`[Stub ${table}] Post-RLS count:`, results.length);

    for (const f of filters) {
      if (f.kind === "eq") {
        results = results.filter((r) => r[f.col] === f.val);
      } else if (f.kind === "in") {
        results = results.filter((r) => f.val.includes(r[f.col]));
      } else if (f.kind === "ilike") {
        const needle = f.val.replace(/%/g, "").toLowerCase();
        results = results.filter((r) => String(r[f.col]).toLowerCase().includes(needle));
      } else if (f.kind === "or") {
        // Split by comma but NOT inside parentheses (for .in. filters)
        const terms = f.query.split(/,(?![^()]*\))/);
        results = results.filter((r) => {
          return terms.some((term) => {
            // Match col.op.val where op is eq, ilike, in
            const match = term.match(/^([^.]+)\.([^.]+)\.(.*)$/);
            if (!match) return false;
            const [, col, op, rawVal] = match;

            const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1");

            if (op === "ilike") {
              const needle = unquote(rawVal).replace(/%/g, "").toLowerCase();
              return String(r[col]).toLowerCase().includes(needle);
            }
            if (op === "eq") {
              return String(r[col]) === unquote(rawVal);
            }
            if (op === "in") {
              // Extract values between parentheses and handle quotes
              const inside = rawVal.replace(/^\((.*)\)$/, "$1");
              // Split by comma but ignore commas inside double quotes
              const list = inside.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v => unquote(v.trim()));
              return list.includes(String(r[col]));
            }
            return false;
          });
        });
      }
    }

    const orderFilter = filters.find(f => f.kind === "order") as { col: string, ascending: boolean } | undefined;
    if (orderFilter) {
      results.sort((a, b) => {
        const valA = a[orderFilter.col];
        const valB = b[orderFilter.col];
        if (valA < valB) return orderFilter.ascending ? -1 : 1;
        if (valA > valB) return orderFilter.ascending ? 1 : -1;
        return 0;
      });
    }

    const limitFilter = filters.find(f => f.kind === "limit") as { count: number } | undefined;
    if (limitFilter) {
      results = results.slice(0, limitFilter.count);
    }

    // console.log(`[Stub ${table}] Post-Filter count:`, results.length);

    if (table === "kg_edges") {
      results = results.map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source_node);
        const targetNode = nodes.find((n) => n.id === e.target_node);

        const checkNode = (node: any) => {
          if (!node) return false;
          if (node.org_id !== activeCtx.org_id) return false;
          if (activeCtx.user_role === "admin") return true;
          if (node.visibility === "org_wide" || node.visibility === "public") return true;
          if (activeCtx.department_id && node.department_ids?.includes(activeCtx.department_id)) {
            return ["department", "bi_accessible"].includes(node.visibility);
          }
          if (activeCtx.user_role === "super_user") {
            const hasGrant = activeCtx.accessible_dept_ids?.some((id: string) => node.department_ids?.includes(id));
            if (hasGrant && node.visibility !== "confidential") return true;
          }
          return false;
        };

        return {
          ...e,
          source: checkNode(sourceNode) ? sourceNode : null,
          target: checkNode(targetNode) ? targetNode : null,
        };
      });
    }

    if (isMaybeSingle) return { data: results[0] ?? null, error: null };
    return { data: results, error: null };
  };

  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    exec().then(resolve).catch(reject);
  };
  return builder;
}

// ---- Import AFTER mocks ---------------------------------------
import {
  getNodeById,
  getNodeByLabel,
  getNeighbors,
  getRecentNodes,
  searchNodes,
  findNodes,
  traverseFromNode,
  getCommunity,
} from "../query";

beforeEach(() => {
  nodes.length = 0;
  edges.length = 0;
  idCounter = 0;
  // Reset default context
  ctx.department_id = "dept-sales";
  ctx.user_role = "member";
  ctx.org_id = "org-1";
});

describe("searchNodes", () => {
  it("filters nodes by label or description and returns QueryResult", async () => {
    nodes.push({ id: "n1", org_id: "org-1", label: "Apple", description: "A fruit", entity_type: "c", department_ids: ["dept-sales"], source_documents: [], visibility: "public", updated_at: "2024-01-01" });
    const res = await searchNodes(ctx, "fruit");
    expect(res.nodes).toHaveLength(1);
    expect(res.boundary_reached).toBe(false);
  });
});

describe("Department Boundary (ATH-61 7.1)", () => {
  it("Sales user cannot traverse into Engineering nodes", async () => {
    nodes.push(
      {
        id: "sales-node",
        org_id: "org-1",
        label: "Sales Doc",
        entity_type: "document",
        department_ids: ["dept-sales"],
        visibility: "department",
        source_documents: [],
        description: null,
        updated_at: "2024-01-01"
      },
      {
        id: "eng-node",
        org_id: "org-1",
        label: "Internal Eng Secret",
        entity_type: "document",
        department_ids: ["dept-eng"],
        visibility: "department",
        source_documents: [],
        description: null,
        updated_at: "2024-01-01"
      }
    );

    edges.push({
      id: "e1",
      org_id: "org-1",
      source_node: "sales-node",
      target_node: "eng-node",
      relation: "REFERENCES",
      provenance: "EXTRACTED",
      confidence: 1.0,
      department_id: "dept-sales",
      visibility: "department"
    });

    const salesCtx = { ...ctx, department_id: "dept-sales" };
    
    // 1. Verify Sales user sees the sales node
    const nodeRes = await getNodeById(salesCtx, "sales-node");
    expect(nodeRes.nodes).toHaveLength(1);

    // 2. Verify Sales user CANNOT see the eng node directly
    const engRes = await getNodeById(salesCtx, "eng-node");
    expect(engRes.nodes).toHaveLength(0);

    // 3. Verify Traversal stops at the boundary
    const traverseRes = await traverseFromNode(salesCtx, "sales-node", { maxHops: 2 });
    
    // Should only contain the sales node
    expect(traverseRes.nodes).toHaveLength(1);
    expect(traverseRes.nodes[0].id).toBe("sales-node");
    
    // Should contain the edge, but boundary_reached must be true
    expect(traverseRes.edges).toHaveLength(1);
    expect(traverseRes.boundary_reached).toBe(true);
  });

  it("Elevated Access (ATH-61 7.2): super_user with Eng grant can traverse", async () => {
    nodes.push(
      { id: "s1", org_id: "org-1", label: "Sales", department_ids: ["dept-sales"], visibility: "department", entity_type: "c", source_documents: [], description: null, updated_at: "" },
      { id: "e1", org_id: "org-1", label: "Eng", department_ids: ["dept-eng"], visibility: "department", entity_type: "c", source_documents: [], description: null, updated_at: "" }
    );
    edges.push({ 
      id: "edge", 
      org_id: "org-1", 
      source_node: "s1", 
      target_node: "e1", 
      relation: "R", 
      provenance: "E", 
      confidence: 1.0,
      visibility: "org_wide" 
    });

    const superUserCtx = {
      ...ctx,
      user_role: "super_user" as const,
      department_id: "dept-sales",
      accessible_dept_ids: ["dept-eng"] // Granted Engineering access
    };

    const res = await traverseFromNode(superUserCtx, "s1", { maxHops: 2 });
    
    // Should see both nodes and edge, boundary_reached: false
    expect(res.nodes).toHaveLength(2);
    expect(res.edges).toHaveLength(1);
    expect(res.boundary_reached).toBe(false);
  });

  it("super_user is STILL blocked by 'confidential' visibility", async () => {
    nodes.push(
      { id: "s1", org_id: "org-1", label: "Sales", department_ids: ["dept-sales"], visibility: "department", entity_type: "c", source_documents: [], description: null, updated_at: "" },
      { id: "e1", org_id: "org-1", label: "Eng Secret", department_ids: ["dept-eng"], visibility: "confidential", entity_type: "c", source_documents: [], description: null, updated_at: "" }
    );
    edges.push({ 
      id: "edge", 
      org_id: "org-1", 
      source_node: "s1", 
      target_node: "e1", 
      relation: "R", 
      provenance: "E", 
      confidence: 1.0,
      visibility: "org_wide" 
    });

    const superUserCtx = {
      ...ctx,
      user_role: "super_user" as const,
      accessible_dept_ids: ["dept-eng"]
    };

    const res = await traverseFromNode(superUserCtx, "s1", { maxHops: 2 });
    expect(res.nodes).toHaveLength(1); // Blocked by confidential
    expect(res.boundary_reached).toBe(true);
  });

  it("Confidential Nodes (ATH-61 7.3): Blocked even with department match", async () => {
    nodes.push({
      id: "conf-node",
      org_id: "org-1",
      label: "Secret Salary Info",
      entity_type: "document",
      department_ids: ["dept-sales"],
      visibility: "confidential", // Hard wall
      source_documents: [],
      description: null,
      updated_at: ""
    });

    // 1. Member in Sales cannot see it
    const salesCtx = { ...ctx, department_id: "dept-sales" };
    const res = await getNodeById(salesCtx, "conf-node");
    expect(res.nodes).toHaveLength(0);

    // 2. Admin CAN see it
    const adminCtx = { ...ctx, user_role: "admin" as const };
    const adminRes = await getNodeById(adminCtx, "conf-node");
    expect(adminRes.nodes).toHaveLength(1);
  });

  it("Org Isolation (ATH-61 7.4): Absolute boundary between orgs", async () => {
    nodes.push(
      { id: "o1-node", org_id: "org-1", label: "Org 1 Node", department_ids: [], visibility: "public", entity_type: "c", source_documents: [], description: null, updated_at: "" },
      { id: "o2-node", org_id: "org-2", label: "Org 2 Node", department_ids: [], visibility: "public", entity_type: "c", source_documents: [], description: null, updated_at: "" }
    );

    // Edge that "crosses" orgs
    edges.push({
      id: "cross-edge",
      org_id: "org-1",
      source_node: "o1-node",
      target_node: "o2-node",
      relation: "LINK",
      provenance: "E",
      confidence: 1.0,
      visibility: "org_wide"
    });

    const org1Ctx = { ...ctx, org_id: "org-1" };

    // 1. Can see its own node
    const res1 = await getNodeById(org1Ctx, "o1-node");
    expect(res1.nodes).toHaveLength(1);

    // 2. CANNOT see the other org's node
    const res2 = await getNodeById(org1Ctx, "o2-node");
    expect(res2.nodes).toHaveLength(0);

    // 3. Traversal stops at the org boundary
    const traverseRes = await traverseFromNode(org1Ctx, "o1-node", { maxHops: 2 });
    expect(traverseRes.nodes).toHaveLength(1);
    expect(traverseRes.nodes[0].id).toBe("o1-node");
    expect(traverseRes.boundary_reached).toBe(true);
  });

  it("Admin bypasses department boundaries", async () => {
    nodes.push(
      { id: "s1", org_id: "org-1", label: "Sales", department_ids: ["dept-sales"], visibility: "department", entity_type: "c", source_documents: [], description: null, updated_at: "2024-01-01" },
      { id: "e1", org_id: "org-1", label: "Eng", department_ids: ["dept-eng"], visibility: "department", entity_type: "c", source_documents: [], description: null, updated_at: "2024-01-01" }
    );
    edges.push({ 
      id: "edge", 
      org_id: "org-1", 
      source_node: "s1", 
      target_node: "e1", 
      relation: "R", 
      provenance: "E", 
      confidence: 1.0,
      visibility: "org_wide"
    });

    const adminCtx = { ...ctx, user_role: "admin" as const };
    const res = await traverseFromNode(adminCtx, "s1", { maxHops: 2 });
    
    expect(res.nodes).toHaveLength(2);
    expect(res.boundary_reached).toBe(false);
  });
});

describe("getNeighbors", () => {
  it("respects RLS boundaries in 1-hop fetch", async () => {
    nodes.push({ id: "n1", org_id: "org-1", label: "Public", department_ids: ["dept-sales"], visibility: "public", entity_type: "c", source_documents: [], updated_at: "", description: null });
    // n2 is eng-only
    edges.push({ 
      id: "e1", 
      org_id: "org-1", 
      source_node: "n1", 
      target_node: "n2", 
      relation: "R", 
      provenance: "E", 
      confidence: 1.0,
      visibility: "org_wide"
    });

    const res = await getNeighbors(ctx, "n1");
    expect(res.nodes).toHaveLength(1); // Only n1
    expect(res.boundary_reached).toBe(true);
  });
});

describe("getCommunity", () => {
  it("returns both nodes and intra-community edges", async () => {
    nodes.push(
      { id: "c1-n1", org_id: "org-1", label: "N1", community: "community-42", entity_type: "c", department_ids: [], visibility: "org_wide", source_documents: [], updated_at: "", description: null },
      { id: "c1-n2", org_id: "org-1", label: "N2", community: "community-42", entity_type: "c", department_ids: [], visibility: "org_wide", source_documents: [], updated_at: "", description: null },
      { id: "c2-n1", org_id: "org-1", label: "N3", community: "community-99", entity_type: "c", department_ids: [], visibility: "org_wide", source_documents: [], updated_at: "", description: null }
    );
    edges.push({
      id: "e-internal",
      org_id: "org-1",
      source_node: "c1-n1",
      target_node: "c1-n2",
      relation: "KNOWS",
      provenance: "E",
      confidence: 1.0,
    });
    edges.push({
      id: "e-external",
      org_id: "org-1",
      source_node: "c1-n1",
      target_node: "c2-n1",
      relation: "KNOWS",
      provenance: "E",
      confidence: 1.0,
    });

    const res = await getCommunity(ctx, "community-42");
    expect(res.nodes).toHaveLength(2);
    expect(res.edges).toHaveLength(1);
    expect(res.edges[0].id).toBe("e-internal");
  });
});

describe("Truncation Semantics", () => {
  it("searchNodes returns truncated: true when limit is reached", async () => {
    for (let i = 0; i < 5; i++) {
      nodes.push({ id: `item-${i}`, org_id: "org-1", label: "SearchItem", entity_type: "c", department_ids: [], visibility: "public", source_documents: [], updated_at: "", description: null });
    }
    const res = await searchNodes(ctx, "SearchItem", 3);
    expect(res.nodes).toHaveLength(3);
    expect(res.truncated).toBe(true);
    expect(res.boundary_reached).toBe(false);
  });

  it("findNodes returns truncated: true when limit is reached", async () => {
    for (let i = 0; i < 5; i++) {
      nodes.push({ id: `find-${i}`, org_id: "org-1", label: "FindItem", entity_type: "c", department_ids: [], visibility: "public", source_documents: [], updated_at: "", description: null });
    }
    const res = await findNodes(ctx, { query: "FindItem" }, 3);
    expect(res.nodes).toHaveLength(3);
    expect(res.truncated).toBe(true);
    expect(res.boundary_reached).toBe(false);
  });
});
