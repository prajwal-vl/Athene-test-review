import type { BaseMessage } from "@langchain/core/messages";

export type AtheneState = {
  thread_id: string;
  org_id: string;
  user_id: string;
  user_role: "admin" | "member" | "bi_analyst";
  user_dept_id: string;
  accessible_dept_ids: string[];
  bi_grant_id: string | null;
  messages: BaseMessage[];
  active_agent: string | null;
  task_type: string;
  complexity: "simple" | "medium" | "complex";
  is_cross_dept_query: boolean;
  retrieved_context: {
    chunk_id: string;
    dept_id: string;
    source_url: string;
    title: string;
    score: number;
    content: string;
  }[];
  pending_tool_calls: {
    tool_call_id: string;
    tool_name: string;
    qstash_message_id: string;
    dispatched_at: string;
  }[];
  run_status: "running" | "awaiting_tool" | "awaiting_approval" | "complete" | "error";
  awaiting_approval: {
    tool_call_id: string;
    tool_name: string;
    tool_args: Record<string, unknown>;
    description: string;
    requested_at: string;
  } | null;
  pending_write_action: {
    action_type: "send_email" | "create_event" | "update_event";
    preview: string;
    payload: unknown;
  } | null;
  final_answer: string | null;
  cited_sources: { chunk_id: string; source_url: string; title: string }[];
};

export function stripEphemeralContent(state: AtheneState): AtheneState {
  return {
    ...state,
    retrieved_context: state.retrieved_context.map((item) => ({ ...item, content: "" })),
  };
}
