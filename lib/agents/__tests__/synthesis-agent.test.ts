// ============================================================
// synthesis-agent.test.ts — Unit tests for ATH-39
//
// Covers:
//   • Standard mode — cited answer, citation extraction
//   • BI mode — activated by task_type="analytical" or is_cross_dept_query
//   • Empty chunks — hallucination prevention / refusal path (no LLM call)
//   • Hallucinated doc IDs — unknown IDs silently dropped
//   • Multiple citations — deduplication across chunks
//   • LLM error — throw propagates out of the node
//   • Missing prompt file — throws descriptive error
//   • Complex content array — multimodal LLM response handling
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";

// ---- Hoist mocks BEFORE any imports that use them ----------

const mockInvoke = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock("../../langgraph/llm-factory", () => ({
  model: { invoke: mockInvoke },
}));

vi.mock("fs", () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}));

// ---- Import after mocks ------------------------------------

import { synthesisAgentNode } from "../synthesis-agent";
import type { AtheneState } from "../../langgraph/state";

// ---- Helpers -----------------------------------------------

const PROMPT_TEMPLATE = "Mode: {{MODE}}\nContext: {{CONTEXT}}";

function makeState(overrides: Partial<AtheneState> = {}): AtheneState {
  return {
    retrieval_results: [],
    messages: [new HumanMessage("What is the revenue?")],
    orgId: "org-1",
    userId: "user-1",
    role: "member",
    next: "",
    final_answer: null,
    citations: [],
    task_type: "retrieval",
    is_cross_dept_query: false,
    ...overrides,
  } as unknown as AtheneState;
}

const DOC_A: any = {
  document_id: "doc_123",
  content_preview: "Revenue hit $1M this quarter.",
  chunk_index: 0,
  source_type: "pdf",
  external_url: "https://example.com/report.pdf",
};

const DOC_B: any = {
  document_id: "doc_456",
  content_preview: "Operating costs were $800K.",
  chunk_index: 0,
  source_type: "spreadsheet",
  external_url: null,
};

// ---- Tests -------------------------------------------------

describe("synthesisAgentNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue(PROMPT_TEMPLATE);
  });

  // ── Standard mode ────────────────────────────────────────

  it("standard mode: returns cited answer and clears retrieval_results", async () => {
    mockInvoke.mockResolvedValue({ content: "Revenue is $1M [doc_123]." });

    const result = await synthesisAgentNode(
      makeState({ retrieval_results: [DOC_A] }),
    );

    expect(result.final_answer).toBe("Revenue is $1M [doc_123].");
    expect(result.citations).toHaveLength(1);
    expect((result.citations as any[])[0].document_id).toBe("doc_123");
    expect((result.citations as any[])[0].external_url).toBe(
      "https://example.com/report.pdf",
    );
    expect(result.retrieval_results).toHaveLength(0);
  });

  it("standard mode: system prompt contains STANDARD MODE and chunk context", async () => {
    mockInvoke.mockResolvedValue({ content: "Answer [doc_123]." });

    await synthesisAgentNode(makeState({ retrieval_results: [DOC_A] }));

    const [systemMsg] = mockInvoke.mock.calls[0][0];
    expect(systemMsg.content).toContain("STANDARD MODE");
    expect(systemMsg.content).toContain("doc_123");
    expect(systemMsg.content).toContain("Revenue hit $1M this quarter.");
  });

  // ── BI mode ──────────────────────────────────────────────

  it("BI mode: activated when task_type='analytical'", async () => {
    mockInvoke.mockResolvedValue({ content: "BI answer [doc_456]." });

    await synthesisAgentNode(
      makeState({ retrieval_results: [DOC_B], task_type: "analytical" }),
    );

    const [systemMsg] = mockInvoke.mock.calls[0][0];
    expect(systemMsg.content).toContain("BI (BUSINESS INTELLIGENCE) MODE");
  });

  it("BI mode: activated when is_cross_dept_query=true", async () => {
    mockInvoke.mockResolvedValue({ content: "Cross-dept answer [doc_123]." });

    await synthesisAgentNode(
      makeState({ retrieval_results: [DOC_A], is_cross_dept_query: true }),
    );

    const [systemMsg] = mockInvoke.mock.calls[0][0];
    expect(systemMsg.content).toContain("BI (BUSINESS INTELLIGENCE) MODE");
  });

  it("standard mode: task_type='retrieval' + cross_dept=false stays STANDARD", async () => {
    mockInvoke.mockResolvedValue({ content: "Standard answer [doc_123]." });

    await synthesisAgentNode(makeState({ retrieval_results: [DOC_A] }));

    const [systemMsg] = mockInvoke.mock.calls[0][0];
    expect(systemMsg.content).toContain("STANDARD MODE");
    expect(systemMsg.content).not.toContain("BUSINESS INTELLIGENCE");
  });

  // ── Empty chunks (hallucination prevention) ───────────────

  it("empty chunks: returns refusal string without calling LLM", async () => {
    const result = await synthesisAgentNode(makeState({ retrieval_results: [] }));

    expect(result.final_answer).toBe(
      "I don't have enough info in your connected sources.",
    );
    expect(result.citations).toHaveLength(0);
    expect(result.retrieval_results).toHaveLength(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("null retrieval_results: treated as empty, no LLM call", async () => {
    const result = await synthesisAgentNode(
      makeState({ retrieval_results: undefined as any }),
    );

    expect(result.final_answer).toBe(
      "I don't have enough info in your connected sources.",
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // ── Hallucination prevention — unknown doc IDs ────────────

  it("hallucinated doc ID: unknown reference dropped from citations, text preserved", async () => {
    mockInvoke.mockResolvedValue({
      content: "Invented fact [doc_999].",
    });

    const result = await synthesisAgentNode(
      makeState({ retrieval_results: [DOC_A] }),
    );

    expect(result.citations).toHaveLength(0);
    expect(result.final_answer).toContain("[doc_999]"); // text preserved
  });

  // ── Multiple citations ────────────────────────────────────

  it("multiple citations: resolves both docs and deduplicates repeated references", async () => {
    mockInvoke.mockResolvedValue({
      content: "Revenue [doc_123] plus costs [doc_456] and again [doc_123].",
    });

    const result = await synthesisAgentNode(
      makeState({ retrieval_results: [DOC_A, DOC_B] }),
    );

    expect(result.citations).toHaveLength(2);
    const ids = (result.citations as any[]).map((c) => c.document_id);
    expect(ids).toContain("doc_123");
    expect(ids).toContain("doc_456");
    // doc_123 referenced twice in text — should appear once in citations
    expect(ids.filter((id: string) => id === "doc_123")).toHaveLength(1);
  });

  // ── LLM error ────────────────────────────────────────────

  it("LLM error: propagates the thrown error to the caller", async () => {
    mockInvoke.mockRejectedValue(new Error("Rate limit exceeded"));

    await expect(
      synthesisAgentNode(makeState({ retrieval_results: [DOC_A] })),
    ).rejects.toThrow("Rate limit exceeded");
  });

  // ── Prompt file error ─────────────────────────────────────

  it("missing prompt file: throws descriptive error", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    await expect(
      synthesisAgentNode(makeState({ retrieval_results: [DOC_A] })),
    ).rejects.toThrow("Synthesis prompt file missing");
  });

  // ── Complex (multimodal) content array from LLM ───────────

  it("complex content array: joins text parts into final_answer", async () => {
    mockInvoke.mockResolvedValue({
      content: [{ type: "text", text: "Revenue is $1M [doc_123]." }],
    });

    const result = await synthesisAgentNode(
      makeState({ retrieval_results: [DOC_A] }),
    );

    expect(result.final_answer).toBe("Revenue is $1M [doc_123].");
    expect(result.citations).toHaveLength(1);
  });
});
