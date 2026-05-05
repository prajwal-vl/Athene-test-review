import type { AtheneState } from "@/lib/langgraph/state";
import { createEmailApproval } from "@/lib/langgraph/tools/email-send";

export async function emailAgentNode(state: AtheneState): Promise<Partial<AtheneState>> {
  const prompt = String(state.messages.at(-1)?.content || "");
  if (/\b(send|reply)\b/i.test(prompt)) {
    const approval = createEmailApproval({ instruction: prompt });
    return {
      run_status: "awaiting_approval",
      awaiting_approval: { ...approval, tool_call_id: crypto.randomUUID(), requested_at: new Date().toISOString() },
      pending_write_action: { action_type: "send_email", preview: approval.description, payload: approval.tool_args },
    };
  }
  return { task_type: "email_read" };
}
