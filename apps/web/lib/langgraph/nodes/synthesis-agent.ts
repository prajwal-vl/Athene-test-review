import type { AtheneState } from "@/lib/langgraph/state";
import { resolveModelClient } from "@/lib/langgraph/llm-factory";

export async function synthesisAgentNode(state: AtheneState): Promise<Partial<AtheneState>> {
  if (state.run_status === "awaiting_approval" || state.run_status === "awaiting_tool") return {};
  const prompt = String(state.messages.at(-1)?.content || "");
  const context = state.retrieved_context
    .map((item, index) => `[${index + 1}] ${item.title}\nURL: ${item.source_url}\n${item.content || "Metadata match only; source content was not persisted."}`)
    .join("\n\n");
  const llm = await resolveModelClient(state.org_id, state.complexity);
  const response = await llm.invoke([
    ["system", "You are Athene AI. Answer with concise enterprise intelligence. Cite available source titles. Never claim access to document bodies unless context text is present."],
    ["human", `Question:\n${prompt}\n\nEphemeral context:\n${context || "No matching context was found."}`],
  ]);
  return { final_answer: String(response.content), run_status: "complete" };
}
