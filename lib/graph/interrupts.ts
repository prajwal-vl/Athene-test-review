// ============================================================
// graph/interrupts.ts — HITL approval gate logic (ATH-43)
//
// Handles the approve / edit / reject flow for write actions
// that are paused at the interrupt_before gate.
//
// Flow:
//   1. email_agent or calendar_agent sets awaiting_approval=true
//      and populates pending_write_action.
//   2. Graph pauses because approval_node has interrupt_before.
//   3. Frontend shows the draft to the user.
//   4. User calls POST /api/threads/[id]/approve with their decision.
//   5. This module validates ownership, logs the decision, and
//      updates the checkpoint state before resuming the graph.
//
// Rule #4: No writes without explicit human approval.
// ============================================================

import { supabaseAdmin } from "../supabase/server";
import type { PendingWriteAction } from "../langgraph/state";

// ---- Types ---------------------------------------------------

export type HitlAction = "approve" | "edit" | "reject";

export interface HitlRequest {
  action: HitlAction;
  /** Required when action === "edit" — the corrected payload fields */
  edits?: Record<string, unknown>;
}

export interface HitlResult {
  approved: boolean;
  /** The final payload to execute (original or edited) */
  payload: Record<string, unknown> | null;
}

// ---- Thread ownership check ----------------------------------

/**
 * Verify that the requesting user owns the thread.
 * Returns the thread row or null if unauthorized.
 */
export async function verifyThreadOwner(
  threadId: string,
  userId: string,
  orgId: string,
): Promise<{ id: string; user_id: string; org_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("threads")
    .select("id, user_id, org_id")
    .eq("id", threadId)
    .eq("org_id", orgId)
    .single();

  if (error || !data) return null;

  // Only the thread owner can approve their own actions
  if (data.user_id !== userId) return null;

  return data as { id: string; user_id: string; org_id: string };
}

// ---- Decision processing -------------------------------------

/**
 * Process a HITL decision and return the state updates to apply
 * before resuming the graph.
 */
export function processDecision(
  request: HitlRequest,
  pendingAction: PendingWriteAction,
): HitlResult {
  switch (request.action) {
    case "approve":
      return {
        approved: true,
        payload: pendingAction.payload,
      };

    case "edit":
      if (!request.edits || Object.keys(request.edits).length === 0) {
        throw new Error("Edit action requires non-empty edits object");
      }
      return {
        approved: true,
        payload: { ...pendingAction.payload, ...request.edits },
      };

    case "reject":
      return {
        approved: false,
        payload: null,
      };

    default:
      throw new Error(`Invalid HITL action: ${request.action}`);
  }
}

// ---- Audit logging -------------------------------------------

/**
 * Write a row to the hitl_decisions table for every approval decision.
 * This is a hard requirement — every decision must be audit-logged.
 */
export async function logHitlDecision(params: {
  orgId: string;
  threadId: string;
  userId: string;
  actionType: string;
  decision: HitlAction;
  originalPayload: Record<string, unknown>;
  editedPayload: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("hitl_decisions").insert({
    org_id: params.orgId,
    thread_id: params.threadId,
    user_id: params.userId,
    action_type: params.actionType,
    decision: params.decision === "approve" ? "approved"
      : params.decision === "edit" ? "edited"
      : "rejected",
    original_payload: params.originalPayload,
    edited_payload: params.editedPayload,
  });

  if (error) {
    // Log but don't throw — audit failures should not block the action
    console.error("[hitl] Failed to write audit log:", error.message);
  }
}
