// ============================================================
// storage.test.ts — ATH-59 graph storage layer tests
//
// In-memory Supabase stub backs `withRLS` so we can verify
// merge-on-conflict behavior, orphan deletion, and shared-node
// preservation without hitting a real DB.
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
  metadata: Record<string, unknown>;
};

type EdgeRow = {
  id: string;
  org_id: string;
  source_node: string;
  target_node: string;
  relation: string;
  provenance: string;
  confidence: number;
  source_document: string | null;
  department_id: string | null;
  visibility: string;
  metadata: Record<string, unknown>;
};

const nodes: NodeRow[] = [];
const edges: EdgeRow[] = [];
let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

// ---- Mock withRLS to call directly with the stub --------------
vi.mock("@/lib/supabase/rls-client", () => {
  return {
    withRLS: async <T,>(
      _ctx: unknown,
      cb: (sb: unknown) => Promise<T>
    ): Promise<T> => cb(makeStub()),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: makeStub(),
  supabaseServer: makeStub(),
  supabase: makeStub(),
}));

function makeStub() {
  return {
    from(table: "kg_nodes" | "kg_edges") {
      return queryBuilder(table);
    },
  };
}

function queryBuilder(table: "kg_nodes" | "kg_edges") {
  type Filter =
    | { kind: "eq"; col: string; val: unknown }
    | { kind: "in"; col: string; vals: unknown[] }
    | { kind: "contains"; col: string; vals: unknown[] };
  const filters: Filter[] = [];
  let pendingUpdate: Record<string, unknown> | null = null;
  let pendingInsert: Record<string, unknown>[] | null = null;
  let pendingDelete = false;
  let selectCols: string | null = null;

  const builder: Record<string, unknown> = {};
  builder.select = (cols: string) => {
    selectCols = cols;
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    filters.push({ kind: "eq", col, val });
    return builder;
  };
  builder.in = (col: string, vals: unknown[]) => {
    filters.push({ kind: "in", col, vals });
    return builder;
  };
  builder.contains = (col: string, vals: unknown[]) => {
    filters.push({ kind: "contains", col, vals });
    return builder;
  };
  builder.update = (patch: Record<string, unknown>) => {
    pendingUpdate = patch;
    return builder;
  };
  builder.insert = (rows: Record<string, unknown>[]) => {
    pendingInsert = rows;
    return builder;
  };
  builder.delete = () => {
    pendingDelete = true;
    return builder;
  };

  const exec = async () => {
    const dataset: Record<string, unknown>[] =
      table === "kg_nodes"
        ? (nodes as unknown as Record<string, unknown>[])
        : (edges as unknown as Record<string, unknown>[]);

    const matches = dataset.filter((row) =>
      filters.every((f) => {
        const v = row[f.col];
        if (f.kind === "eq") return v === f.val;
        if (f.kind === "in") return f.vals.includes(v);
        if (f.kind === "contains") {
          return Array.isArray(v) && f.vals.every((x) => v.includes(x));
        }
        return false;
      })
    );

    // delete
    if (pendingDelete) {
      for (const row of matches) {
        const idx = dataset.indexOf(row);
        if (idx !== -1) dataset.splice(idx, 1);
      }
      return { data: null, error: null };
    }

    // update
    if (pendingUpdate) {
      for (const row of matches) Object.assign(row, pendingUpdate);
      return { data: null, error: null };
    }

    // insert
    if (pendingInsert) {
      const inserted: Record<string, unknown>[] = [];
      for (const row of pendingInsert) {
        const id = nextId(table === "kg_nodes" ? "n" : "e");
        const full = { id, ...row };
        dataset.push(full);
        inserted.push(full);
      }
      if (selectCols) return { data: inserted, error: null };
      return { data: null, error: null };
    }

    // select
    return { data: matches, error: null };
  };

  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
    exec().then(resolve).catch(reject);
  };
  return builder;
}

// ---- Import AFTER mocks ---------------------------------------
import { deleteByDocument, upsertEdges, upsertNodes } from "@/lib/knowledge-graph/storage";
import type { KGEdge, KGNode } from "@/lib/knowledge-graph/types";

const ctx = {
  org_id: "org-1",
  user_id: "user-1",
  user_role: "admin" as const,
  department_id: "dept-1",
};

beforeEach(() => {
  nodes.length = 0;
  edges.length = 0;
  idCounter = 0;
});

const node = (overrides: Partial<KGNode> = {}): KGNode => ({
  org_id: "org-1",
  label: "Project X",
  entity_type: "project",
  department_ids: ["dept-1"],
  visibility: "department",
  source_documents: ["doc-1"],
  ...overrides,
});

describe("upsertNodes", () => {
  it("inserts new nodes and returns id map", async () => {
    const map = await upsertNodes(ctx, [
      node({ label: "A" }),
      node({ label: "B" }),
    ]);
    expect(nodes).toHaveLength(2);
    expect(map.size).toBe(2);
    expect(map.get("A::project")).toBeDefined();
    expect(map.get("B::project")).toBeDefined();
  });

  it("merges department_ids and source_documents on conflict (union, not replace)", async () => {
    await upsertNodes(ctx, [
      node({ label: "A", department_ids: ["dept-1"], source_documents: ["doc-1"] }),
    ]);
    await upsertNodes(ctx, [
      node({ label: "A", department_ids: ["dept-2"], source_documents: ["doc-2"] }),
    ]);
    expect(nodes).toHaveLength(1);
    expect([...nodes[0].department_ids].sort()).toEqual(["dept-1", "dept-2"]);
    expect([...nodes[0].source_documents].sort()).toEqual(["doc-1", "doc-2"]);
  });

  it("upgrades visibility but never narrows", async () => {
    await upsertNodes(ctx, [node({ label: "A", visibility: "private" })]);
    await upsertNodes(ctx, [node({ label: "A", visibility: "public" })]);
    expect(nodes[0].visibility).toBe("public");
    await upsertNodes(ctx, [node({ label: "A", visibility: "private" })]);
    expect(nodes[0].visibility).toBe("public"); // not narrowed
  });
});

describe("upsertEdges", () => {
  it("inserts new edges resolved through label→id map", async () => {
    const map = await upsertNodes(ctx, [
      node({ label: "A" }),
      node({ label: "B" }),
    ]);

    const e: KGEdge = {
      org_id: "org-1",
      source_label: "A",
      source_entity_type: "project",
      target_label: "B",
      target_entity_type: "project",
      relation: "USES",
      provenance: "EXTRACTED",
      confidence: 1.0,
      visibility: "department",
      department_id: "dept-1",
      source_document: "doc-1",
    };
    await upsertEdges(ctx, [e], map);
    expect(edges).toHaveLength(1);
    expect(edges[0].relation).toBe("USES");
    expect(edges[0].provenance).toBe("EXTRACTED");
  });

  it("never downgrades provenance, keeps GREATEST confidence", async () => {
    const map = await upsertNodes(ctx, [node({ label: "A" }), node({ label: "B" })]);

    const base: KGEdge = {
      org_id: "org-1",
      source_label: "A",
      source_entity_type: "project",
      target_label: "B",
      target_entity_type: "project",
      relation: "USES",
      provenance: "EXTRACTED",
      confidence: 1.0,
      visibility: "department",
      department_id: null,
      source_document: null,
    };

    await upsertEdges(ctx, [base], map);
    await upsertEdges(
      ctx,
      [{ ...base, provenance: "INFERRED", confidence: 0.7 }],
      map
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].provenance).toBe("EXTRACTED");
    expect(edges[0].confidence).toBe(1.0);

    await upsertEdges(
      ctx,
      [{ ...base, provenance: "AMBIGUOUS", confidence: 0.5 }],
      map
    );
    expect(edges[0].provenance).toBe("EXTRACTED");
    expect(edges[0].confidence).toBe(1.0);
  });

  it("skips edges whose endpoints are missing from the id map", async () => {
    const map = new Map<string, string>([["A::project", "n-99"]]);
    const e: KGEdge = {
      org_id: "org-1",
      source_label: "A",
      source_entity_type: "project",
      target_label: "Phantom",
      target_entity_type: "project",
      relation: "USES",
      provenance: "EXTRACTED",
      confidence: 1.0,
      visibility: "department",
      department_id: null,
      source_document: null,
    };
    await upsertEdges(ctx, [e], map);
    expect(edges).toHaveLength(0);
  });
});

describe("deleteByDocument", () => {
  it("removes orphan nodes and the edges tagged with that document", async () => {
    const map = await upsertNodes(ctx, [
      node({ label: "Orphan", source_documents: ["doc-orphan"] }),
      node({ label: "Other", source_documents: ["doc-other"] }),
    ]);
    await upsertEdges(
      ctx,
      [
        {
          org_id: "org-1",
          source_label: "Orphan",
          source_entity_type: "project",
          target_label: "Other",
          target_entity_type: "project",
          relation: "USES",
          provenance: "EXTRACTED",
          confidence: 1.0,
          visibility: "department",
          department_id: null,
          source_document: "doc-orphan",
        },
      ],
      map
    );

    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);

    await deleteByDocument(ctx, "doc-orphan");

    // Orphan node gone
    expect(nodes.find((n) => n.label === "Orphan")).toBeUndefined();
    // Other survives
    expect(nodes.find((n) => n.label === "Other")).toBeDefined();
    // Edge tagged with doc-orphan deleted
    expect(edges).toHaveLength(0);
  });

  it("preserves shared nodes by removing only the document from source_documents", async () => {
    await upsertNodes(ctx, [
      node({ label: "Shared", source_documents: ["doc-1", "doc-2"] }),
    ]);

    await deleteByDocument(ctx, "doc-1");

    expect(nodes).toHaveLength(1);
    expect(nodes[0].source_documents).toEqual(["doc-2"]);
  });
});
