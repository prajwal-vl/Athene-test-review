import type { AtheneState } from "@/lib/langgraph/state";
import { createCalendarApproval } from "@/lib/langgraph/tools/calendar-create";

export async function calendarAgentNode(state: AtheneState): Promise<Partial<AtheneState>> {
  const prompt = String(state.messages.at(-1)?.content || "");
  if (/\b(create|schedule|reschedule|book)\b/i.test(prompt)) {
    const approval = createCalendarApproval({ instruction: prompt });
    return {
      run_status: "awaiting_approval",
      awaiting_approval: { ...approval, tool_call_id: crypto.randomUUID(), requested_at: new Date().toISOString() },
      pending_write_action: { action_type: "create_event", preview: approval.description, payload: approval.tool_args },
    };
  }
  return { task_type: "calendar_read" };
}
