import type { AtheneState } from "@/lib/langgraph/state";
import { retrievalAgentNode } from "@/lib/langgraph/nodes/retrieval-agent";

export async function reportAgentNode(state: AtheneState) {
  return retrievalAgentNode(state);
}
