import type { AtheneState } from "@/lib/langgraph/state";
import { getQStashClient } from "@/lib/qstash/client";
import { requireEnv } from "@/lib/env";

export async function dataIndexAgentNode(state: AtheneState): Promise<Partial<AtheneState>> {
  if (state.user_role !== "admin") throw new Error("Only admins can trigger indexing");
  const toolCallId = crypto.randomUUID();
  return {
    run_status: "awaiting_approval",
    awaiting_approval: {
      tool_call_id: toolCallId,
      tool_name: "data-index",
      tool_args: { prompt: String(state.messages.at(-1)?.content || "") },
      description: "Start a background indexing job for the selected integration",
      requested_at: new Date().toISOString(),
    },
  };
}

export async function publishIndexJob(input: { threadId: string; orgId: string; userId: string; toolCallId: string; toolArgs: unknown }) {
  const result = await getQStashClient().publishJSON({
    url: `${requireEnv("NEXT_PUBLIC_APP_URL")}/api/worker/nango-fetch`,
    body: {
      thread_id: input.threadId,
      org_id: input.orgId,
      user_id: input.userId,
      tool_call_id: input.toolCallId,
      tool_args: input.toolArgs,
    },
  });
  return result.messageId;
}
