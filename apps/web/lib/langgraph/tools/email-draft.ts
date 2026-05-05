import { resolveModelClient } from "@/lib/langgraph/llm-factory";

export async function draftEmail(orgId: string, instruction: string) {
  const llm = await resolveModelClient(orgId, "medium");
  const result = await llm.invoke([
    ["system", "Draft a concise business email. Return only the draft body."],
    ["human", instruction],
  ]);
  return String(result.content);
}
