import { createHash } from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function auditCrossDeptAccess(input: {
  threadId: string;
  userId: string;
  orgId: string;
  queriedDeptIds: string[];
  chunkIdsAccessed: string[];
  prompt: string;
  grantId: string | null;
}) {
  const supabase = createSupabaseServiceClient();
  const promptHash = createHash("sha256").update(input.prompt).digest("hex");
  const { error } = await supabase.from("cross_dept_audit_log").insert({
    thread_id: input.threadId,
    user_id: input.userId,
    org_id: input.orgId,
    queried_dept_ids: input.queriedDeptIds,
    chunk_ids_accessed: input.chunkIdsAccessed,
    prompt_hash: promptHash,
    grant_id: input.grantId,
  });
  if (error) throw error;
}
