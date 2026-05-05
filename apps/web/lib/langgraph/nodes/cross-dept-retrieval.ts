import type { AtheneState } from "@/lib/langgraph/state";
import { vectorSearch } from "@/lib/langgraph/tools/vector-search";
import { auditCrossDeptAccess } from "@/lib/supabase/audit";

export async function crossDeptRetrievalNode(state: AtheneState): Promise<Partial<AtheneState>> {
  if (!["admin", "bi_analyst"].includes(state.user_role)) throw new Error("Cross-department queries require admin or BI analyst access");
  const prompt = String(state.messages.at(-1)?.content || "");
  const hits = await vectorSearch(state.user_id, state.org_id, prompt, 10);
  const allowedHits = state.user_role === "bi_analyst"
    ? hits.filter((hit) => hit.visibility === "bi_accessible" && (!hit.dept_id || state.accessible_dept_ids.includes(hit.dept_id)))
    : hits;
  const deptIds = Array.from(new Set(allowedHits.map((hit) => hit.dept_id).filter(Boolean))) as string[];
  await auditCrossDeptAccess({
    threadId: state.thread_id,
    userId: state.user_id,
    orgId: state.org_id,
    queriedDeptIds: deptIds,
    chunkIdsAccessed: allowedHits.map((hit) => hit.chunk_id),
    prompt,
    grantId: state.bi_grant_id,
  });
  return {
    retrieved_context: allowedHits.map((hit) => ({
      chunk_id: hit.chunk_id,
      dept_id: hit.dept_id || "",
      source_url: hit.source_url,
      title: hit.title,
      score: hit.score,
      content: "",
    })),
    cited_sources: allowedHits.map((hit) => ({ chunk_id: hit.chunk_id, source_url: hit.source_url, title: hit.title })),
  };
}
