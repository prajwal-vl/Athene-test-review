// ============================================================
// hitl.test.ts — Unit tests for ATH-43 (HITL Approval Gate)
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock all external modules to prevent import crashes ----
vi.mock("@langchain/langgraph", () => {
  const Annotation: any = { Root: () => ({}) };
  return { Annotation, messagesStateReducer: () => [], StateGraph: vi.fn(), START: "START", END: "END" };
});
vi.mock("@langchain/langgraph-checkpoint", () => ({ BaseCheckpointSaver: class {} }));
vi.mock("@langchain/core/messages", () => ({}));
vi.mock("@langchain/core/runnables", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("openai", () => ({ default: class {} }));
vi.mock("@google/generative-ai", () => ({ GoogleGenerativeAI: class {} }));

const mockInsertCalls: Array<{ table: string; data: unknown }> = [];
const mockThreadRows: Array<{ id: string; user_id: string; org_id: string }> = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_f1: string, v1: string) => ({
          eq: (_f2: string, v2: string) => ({
            single: () => {
              if (table === "threads") {
                const found = mockThreadRows.find((t) => t.id === v1 && t.org_id === v2);
                return Promise.resolve({ data: found ?? null, error: found ? null : { message: "not found" } });
              }
              return Promise.resolve({ data: null, error: null });
            },
          }),
        }),
      }),
      insert: (data: unknown) => {
        mockInsertCalls.push({ table, data });
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

// ---- Imports ------------------------------------------------

import { verifyThreadOwner, processDecision, logHitlDecision } from "../../graph/interrupts";
import { approvalNode } from "../../langgraph/nodes/async-tool-node";

// ---- Setup --------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertCalls.length = 0;
  mockThreadRows.length = 0;
  mockThreadRows.push({ id: "thread-001", user_id: "user-prajwal", org_id: "org-athene" });
});

// ============================================================
// processDecision
// ============================================================

describe("processDecision", () => {
  const pending = {
    tool: "email-send" as const,
    payload: { to: ["bob.smith@acmecorp.com"], cc: [], subject: "Friday Meeting", body: "Hi Bob, let's meet Friday." },
    requested_at: "2026-04-23T10:00:00Z",
  };

  it("approve — returns original payload unchanged", () => {
    const r = processDecision({ action: "approve" }, pending);
    expect(r.approved).toBe(true);
    expect(r.payload).toEqual(pending.payload);
  });

  it("edit — merges edits into original payload", () => {
    const r = processDecision({ action: "edit", edits: { subject: "Updated: Friday Meeting at 3 PM", cc: ["manager@acmecorp.com"] } }, pending);
    expect(r.approved).toBe(true);
    expect(r.payload).toEqual({ to: ["bob.smith@acmecorp.com"], cc: ["manager@acmecorp.com"], subject: "Updated: Friday Meeting at 3 PM", body: "Hi Bob, let's meet Friday." });
  });

  it("edit — throws if edits object is empty", () => {
    expect(() => processDecision({ action: "edit", edits: {} }, pending)).toThrow("non-empty edits");
  });

  it("edit — throws if edits is missing", () => {
    expect(() => processDecision({ action: "edit" }, pending)).toThrow("non-empty edits");
  });

  it("reject — returns approved=false with null payload", () => {
    const r = processDecision({ action: "reject" }, pending);
    expect(r.approved).toBe(false);
    expect(r.payload).toBeNull();
  });

  it("invalid action — throws", () => {
    expect(() => processDecision({ action: "invalid" as any }, pending)).toThrow("Invalid HITL action");
  });
});

// ============================================================
// verifyThreadOwner
// ============================================================

describe("verifyThreadOwner", () => {
  it("returns thread when user is the owner", async () => {
    const t = await verifyThreadOwner("thread-001", "user-prajwal", "org-athene");
    expect(t).not.toBeNull();
    expect(t!.id).toBe("thread-001");
  });

  it("returns null when user is NOT the owner", async () => {
    expect(await verifyThreadOwner("thread-001", "user-intruder", "org-athene")).toBeNull();
  });

  it("returns null for non-existent thread", async () => {
    expect(await verifyThreadOwner("thread-999", "user-prajwal", "org-athene")).toBeNull();
  });
});

// ============================================================
// logHitlDecision
// ============================================================

describe("logHitlDecision", () => {
  it("inserts audit row for approve", async () => {
    await logHitlDecision({ orgId: "org-athene", threadId: "thread-001", userId: "user-prajwal", actionType: "email-send", decision: "approve", originalPayload: { to: ["bob.smith@acmecorp.com"] }, editedPayload: null });
    const rows = mockInsertCalls.filter((c) => c.table === "hitl_decisions");
    expect(rows).toHaveLength(1);
    expect((rows[0].data as any).decision).toBe("approved");
  });

  it("inserts audit row for edit with edited payload", async () => {
    await logHitlDecision({ orgId: "org-athene", threadId: "thread-001", userId: "user-prajwal", actionType: "email-send", decision: "edit", originalPayload: { subject: "Old" }, editedPayload: { subject: "New" } });
    const rows = mockInsertCalls.filter((c) => c.table === "hitl_decisions");
    expect(rows).toHaveLength(1);
    expect((rows[0].data as any).decision).toBe("edited");
    expect((rows[0].data as any).edited_payload).toEqual({ subject: "New" });
  });

  it("inserts audit row for reject", async () => {
    await logHitlDecision({ orgId: "org-athene", threadId: "thread-001", userId: "user-prajwal", actionType: "calendar-create", decision: "reject", originalPayload: { title: "Meeting" }, editedPayload: null });
    const rows = mockInsertCalls.filter((c) => c.table === "hitl_decisions");
    expect(rows).toHaveLength(1);
    expect((rows[0].data as any).decision).toBe("rejected");
  });
});

// ============================================================
// approvalNode
// ============================================================

describe("approvalNode", () => {
  it("clears the gate when action was approved", async () => {
    const update = await approvalNode({ pending_write_action: { tool: "email-send", payload: { to: ["bob@acme.com"] }, requested_at: "2026-04-23T10:00:00Z" }, awaiting_approval: true } as any);
    expect(update.awaiting_approval).toBe(false);
    expect(update.run_status).toBe("running");
  });

  it("clears the gate and sets cancelled message on reject", async () => {
    const update = await approvalNode({ pending_write_action: null, awaiting_approval: true } as any);
    expect(update.awaiting_approval).toBe(false);
    expect(update.pending_write_action).toBeNull();
    expect(update.final_answer).toContain("cancelled");
  });
});
