import { HumanMessage } from "@langchain/core/messages";
import type { UserAccess } from "@/lib/auth/rbac";
import type { AtheneState } from "@/lib/langgraph/state";
import { SupabaseCheckpointer } from "@/lib/langgraph/checkpointer";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { supervisorNode } from "@/lib/langgraph/nodes/supervisor";
import { retrievalAgentNode } from "@/lib/langgraph/nodes/retrieval-agent";
import { crossDeptRetrievalNode } from "@/lib/langgraph/nodes/cross-dept-retrieval";
import { emailAgentNode } from "@/lib/langgraph/nodes/email-agent";
import { calendarAgentNode } from "@/lib/langgraph/nodes/calendar-agent";
import { reportAgentNode } from "@/lib/langgraph/nodes/report-agent";
import { dataIndexAgentNode } from "@/lib/langgraph/nodes/async-tool-node";
import { synthesisAgentNode } from "@/lib/langgraph/nodes/synthesis-agent";

export type StreamEvent =
  | { type: "tool_call"; agent: string; tool: string }
  | { type: "approval_required"; thread_id: string; tool: string; description: string; tool_call_id: string }
  | { type: "token"; content: string }
  | { type: "done"; thread_id: string; cited_sources: AtheneState["cited_sources"] }
  | { type: "error"; message: string };

export function createInitialState(input: { prompt: string; threadId?: string; identity: { userId: string; orgId: string }; access: UserAccess }): AtheneState {
  return {
    thread_id: input.threadId || crypto.randomUUID(),
    org_id: input.identity.orgId,
    user_id: input.identity.userId,
    user_role: input.access.role,
    user_dept_id: input.access.deptId,
    accessible_dept_ids: input.access.accessibleDeptIds,
    bi_grant_id: input.access.biGrantId,
    messages: [new HumanMessage(input.prompt)],
    active_agent: null,
    task_type: "",
    complexity: "simple",
    is_cross_dept_query: false,
    retrieved_context: [],
    pending_tool_calls: [],
    run_status: "running",
    awaiting_approval: null,
    pending_write_action: null,
    final_answer: null,
    cited_sources: [],
  };
}

async function persistConversation(state: AtheneState, prompt: string) {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("conversations").upsert({
    thread_id: state.thread_id,
    org_id: state.org_id,
    user_id: state.user_id,
    dept_id: state.user_dept_id || null,
    prompt,
    final_answer: state.final_answer,
    cited_sources: state.cited_sources,
    agent_path: [state.active_agent, "synthesis_agent"].filter(Boolean),
    model_used: state.complexity,
    was_cross_dept: state.is_cross_dept_query,
    run_status: state.run_status,
    completed_at: state.run_status === "complete" ? new Date().toISOString() : null,
  }, { onConflict: "thread_id" });
  if (error) throw error;
}

export async function* runAtheneGraph(initial: AtheneState): AsyncGenerator<StreamEvent, AtheneState> {
  let state = { ...initial, ...supervisorNode(initial) };
  try {
    if (state.active_agent === "retrieval_agent") {
      yield { type: "tool_call", agent: "retrieval_agent", tool: "vector_search" };
      state = { ...state, ...(await retrievalAgentNode(state)) };
    } else if (state.active_agent === "cross_dept_agent") {
      yield { type: "tool_call", agent: "cross_dept_agent", tool: "rls_vector_search" };
      state = { ...state, ...(await crossDeptRetrievalNode(state)) };
    } else if (state.active_agent === "email_agent") {
      state = { ...state, ...(await emailAgentNode(state)) };
    } else if (state.active_agent === "calendar_agent") {
      state = { ...state, ...(await calendarAgentNode(state)) };
    } else if (state.active_agent === "report_agent") {
      yield { type: "tool_call", agent: "report_agent", tool: "multi_source_retrieval" };
      state = { ...state, ...(await reportAgentNode(state)) };
    } else if (state.active_agent === "data_index_agent") {
      state = { ...state, ...(await dataIndexAgentNode(state)) };
    }

    if (state.awaiting_approval) {
      await new SupabaseCheckpointer().save(state, { reason: "awaiting_approval" });
      await persistConversation(state, String(initial.messages[0].content));
      yield {
        type: "approval_required",
        thread_id: state.thread_id,
        tool: state.awaiting_approval.tool_name,
        description: state.awaiting_approval.description,
        tool_call_id: state.awaiting_approval.tool_call_id,
      };
      return state;
    }

    state = { ...state, ...(await synthesisAgentNode(state)) };
    await persistConversation(state, String(initial.messages[0].content));
    if (state.final_answer) {
      for (const word of state.final_answer.split(/(\s+)/)) yield { type: "token", content: word };
    }
    yield { type: "done", thread_id: state.thread_id, cited_sources: state.cited_sources };
    return state;
  } catch (error) {
    state = { ...state, run_status: "error", final_answer: error instanceof Error ? error.message : "Unknown error" };
    await persistConversation(state, String(initial.messages[0].content));
    yield { type: "error", message: state.final_answer || "Unknown error" };
    return state;
  }
}
