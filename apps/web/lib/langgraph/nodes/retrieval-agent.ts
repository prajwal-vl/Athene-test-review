import type { AtheneState } from "@/lib/langgraph/state";
import { vectorSearch } from "@/lib/langgraph/tools/vector-search";
import { liveFetchDocument } from "@/lib/langgraph/tools/live-doc-fetch";

export async function retrievalAgentNode(state: AtheneState): Promise<Partial<AtheneState>> {
  const query = String(state.messages.at(-1)?.content || "");
  const hits = await vectorSearch(state.user_id, state.org_id, query, 6);
  const context = [];
  for (const hit of hits.slice(0, 3)) {
    try {
      const live = await liveFetchDocument({ orgId: state.org_id, sourceType: hit.source_type as any, sourceId: hit.source_id });
      context.push({
        chunk_id: hit.chunk_id,
        dept_id: hit.dept_id || "",
        source_url: hit.source_url || live.sourceUrl,
        title: hit.title || live.title,
        score: hit.score,
        content: live.content,
      });
    } catch {
      context.push({
        chunk_id: hit.chunk_id,
        dept_id: hit.dept_id || "",
        source_url: hit.source_url,
        title: hit.title,
        score: hit.score,
        content: "",
      });
    }
  }
  return {
    retrieved_context: context,
    cited_sources: hits.map((hit) => ({ chunk_id: hit.chunk_id, source_url: hit.source_url, title: hit.title })),
  };
}
