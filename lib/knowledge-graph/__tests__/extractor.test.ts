// ============================================================
// extractor.test.ts — ATH-58 entity extraction unit tests
//
// The Anthropic SDK is mocked so the test runs offline. We
// inject canned LLM responses to verify normalization, dedup,
// provenance handling, and inheritance of department/visibility.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

let mockResponses: string[] = [];
let mockCallCount = 0;

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class FakeAnthropic {
      messages = {
        create: async () => {
          const text = mockResponses[mockCallCount] ?? "{}";
          mockCallCount++;
          return { content: [{ type: "text", text }] };
        },
      };
    },
  };
});


import {
  extractEntitiesAndRelations,
  maxVisibility,
  strongerProvenance,
  unionStrings,
} from "@/lib/knowledge-graph/extractor";
import type { ExtractorChunk } from "@/lib/knowledge-graph/types";

beforeEach(() => {
  mockResponses = [];
  mockCallCount = 0;
  process.env.ANTHROPIC_API_KEY = "test-key";
});

const ctx = {
  org_id: "org-1",
  user_id: "user-1",
  user_role: "admin" as const,
  department_id: "dept-1",
};

const baseChunk = (overrides: Partial<ExtractorChunk> = {}): ExtractorChunk => ({
  text: "Project Helios uses AWS EKS for orchestration.",
  chunk_index: 0,
  org_id: "org-1",
  document_id: "doc-1",
  department_id: "dept-1",
  visibility: "department",
  ...overrides,
});

describe("extractEntitiesAndRelations", () => {
  it("returns typed nodes/edges with provenance and inherited dept/visibility", async () => {
    mockResponses = [
      JSON.stringify({
        entities: [
          { label: "Project Helios", entity_type: "project", description: "Internal" },
          { label: "AWS EKS", entity_type: "service", description: "Kubernetes" },
        ],
        relationships: [
          {
            source: "Project Helios",
            source_entity_type: "project",
            target: "AWS EKS",
            target_entity_type: "service",
            relation: "USES",
            provenance: "EXTRACTED",
            confidence: 1.0,
          },
        ],
      }),
    ];

    const { nodes, edges } = await extractEntitiesAndRelations([baseChunk()]);

    expect(nodes).toHaveLength(2);
    const helios = nodes.find((n) => n.label === "Project Helios");
    expect(helios).toBeDefined();
    expect(helios!.entity_type).toBe("project");
    expect(helios!.department_ids).toEqual(["dept-1"]);
    expect(helios!.visibility).toBe("department");
    expect(helios!.source_documents).toEqual(["doc-1"]);

    expect(edges).toHaveLength(1);
    expect(edges[0].relation).toBe("USES");
    expect(edges[0].provenance).toBe("EXTRACTED");
    expect(edges[0].confidence).toBe(1.0);
    expect(edges[0].source_document).toBe("doc-1");
    expect(edges[0].department_id).toBe("dept-1");
    expect(edges[0].visibility).toBe("department");
  });

  it("dedups entities across chunks by (label, entity_type) and merges dept_ids/source_documents", async () => {
    mockResponses = [
      JSON.stringify({
        entities: [{ label: "Billing Service", entity_type: "service" }],
        relationships: [],
      }),
      JSON.stringify({
        entities: [{ label: "Billing Service", entity_type: "service" }],
        relationships: [],
      }),
    ];

    const result = await extractEntitiesAndRelations([
      baseChunk({ chunk_index: 0, document_id: "doc-A", department_id: "dept-1" }),
      baseChunk({ chunk_index: 1, document_id: "doc-B", department_id: "dept-2" }),
    ]);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].department_ids.sort()).toEqual(["dept-1", "dept-2"]);
    expect(result.nodes[0].source_documents.sort()).toEqual(["doc-A", "doc-B"]);
  });

  it("clamps confidence and forces EXTRACTED to 1.0", async () => {
    mockResponses = [
      JSON.stringify({
        entities: [
          { label: "A", entity_type: "service" },
          { label: "B", entity_type: "service" },
        ],
        relationships: [
          {
            source: "A",
            source_entity_type: "service",
            target: "B",
            target_entity_type: "service",
            relation: "USES",
            provenance: "EXTRACTED",
            confidence: 0.42, // should be forced to 1.0
          },
        ],
      }),
    ];

    const { edges } = await extractEntitiesAndRelations([baseChunk()]);
    expect(edges).toHaveLength(1);
    expect(edges[0].confidence).toBe(1.0);
  });

  it("falls back to AMBIGUOUS for invalid provenance", async () => {
    mockResponses = [
      JSON.stringify({
        entities: [
          { label: "A", entity_type: "service" },
          { label: "B", entity_type: "service" },
        ],
        relationships: [
          {
            source: "A",
            source_entity_type: "service",
            target: "B",
            target_entity_type: "service",
            relation: "USES",
            provenance: "WHATEVER",
            confidence: 1.5, // out of range
          },
        ],
      }),
    ];

    const { edges } = await extractEntitiesAndRelations([baseChunk()]);
    expect(edges[0].provenance).toBe("AMBIGUOUS");
    expect(edges[0].confidence).toBeGreaterThanOrEqual(0);
    expect(edges[0].confidence).toBeLessThanOrEqual(1);
  });

  it("drops edges whose endpoints aren't in the entities list", async () => {
    mockResponses = [
      JSON.stringify({
        entities: [{ label: "A", entity_type: "service" }],
        relationships: [
          {
            source: "A",
            source_entity_type: "service",
            target: "Phantom",
            target_entity_type: "service",
            relation: "USES",
            provenance: "EXTRACTED",
            confidence: 1.0,
          },
        ],
      }),
    ];
    const { edges } = await extractEntitiesAndRelations([baseChunk()]);
    expect(edges).toHaveLength(0);
  });

  it("strips ```json fences from LLM output", async () => {
    mockResponses = [
      "Here you go:\n```json\n" +
        JSON.stringify({
          entities: [{ label: "X", entity_type: "service" }],
          relationships: [],
        }) +
        "\n```",
    ];
    const { nodes } = await extractEntitiesAndRelations([baseChunk()]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe("X");
  });

  it("returns empty result for empty input", async () => {
    const r = await extractEntitiesAndRelations([]);
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
  });
});

describe("merge helpers", () => {
  it("unionStrings dedupes preserving values", () => {
    expect(unionStrings(["a", "b"], ["b", "c"]).sort()).toEqual(["a", "b", "c"]);
  });

  it("strongerProvenance never downgrades", () => {
    expect(strongerProvenance("EXTRACTED", "INFERRED")).toBe("EXTRACTED");
    expect(strongerProvenance("AMBIGUOUS", "INFERRED")).toBe("INFERRED");
    expect(strongerProvenance("INFERRED", "EXTRACTED")).toBe("EXTRACTED");
  });

  it("maxVisibility broadens correctly", () => {
    expect(maxVisibility("private", "department")).toBe("department");
    expect(maxVisibility("department", "public")).toBe("public");
    expect(maxVisibility("public", "private")).toBe("public");
  });
});
