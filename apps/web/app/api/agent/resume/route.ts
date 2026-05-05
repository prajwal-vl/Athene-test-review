import { verifyQStashRequest } from "@/lib/qstash/verify";
import { SupabaseCheckpointer } from "@/lib/langgraph/checkpointer";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQStashRequest(req, raw))) return Response.json({ error: "Invalid QStash signature" }, { status: 401 });
  const body = JSON.parse(raw);
  const state = await new SupabaseCheckpointer().loadLatest(String(body.thread_id || ""));
  if (!state) return Response.json({ error: "Checkpoint not found" }, { status: 404 });
  if (state.org_id !== body.org_id || state.user_id !== body.user_id) return Response.json({ error: "Checkpoint identity mismatch" }, { status: 403 });
  const { error } = await createSupabaseServiceClient()
    .from("conversations")
    .update({
      run_status: body.result?.ok ? "complete" : "error",
      final_answer: body.result?.message || "Background job completed.",
      completed_at: new Date().toISOString(),
    })
    .eq("thread_id", state.thread_id);
  if (error) throw error;
  return Response.json({ ok: true });
}
