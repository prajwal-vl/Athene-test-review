import { requireIdentity, jsonError } from "@/lib/api/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { identity } = await requireIdentity(req);
    const threadId = new URL(req.url).searchParams.get("thread_id");
    if (!threadId) return Response.json({ error: "thread_id is required" }, { status: 400 });
    const { data, error } = await createSupabaseServiceClient()
      .from("conversations")
      .select("thread_id, run_status, final_answer, cited_sources, completed_at")
      .eq("thread_id", threadId)
      .eq("org_id", identity.orgId)
      .eq("user_id", identity.userId)
      .single();
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}
