import { requireIdentity, jsonError } from "@/lib/api/auth";
import { SupabaseCheckpointer } from "@/lib/langgraph/checkpointer";
import { publishIndexJob } from "@/lib/langgraph/nodes/async-tool-node";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { identity } = await requireIdentity(req);
    const body = await req.json();
    const threadId = String(body.thread_id || "");
    if (!threadId) return Response.json({ error: "thread_id is required" }, { status: 400 });
    const state = await new SupabaseCheckpointer().loadLatest(threadId);
    if (!state) return Response.json({ error: "No pending checkpoint found" }, { status: 404 });
    if (state.org_id !== identity.orgId || state.user_id !== identity.userId) return Response.json({ error: "Checkpoint identity mismatch" }, { status: 403 });
    if (!state.awaiting_approval) return Response.json({ error: "No action is awaiting approval" }, { status: 409 });
    const supabase = createSupabaseServiceClient();
    if (!body.approved) {
      await supabase.from("conversations").update({ run_status: "complete", final_answer: "Action rejected by user.", completed_at: new Date().toISOString() }).eq("thread_id", threadId);
      return Response.json({ status: "rejected" });
    }
    if (state.awaiting_approval.tool_name === "data-index") {
      const msgId = await publishIndexJob({
        threadId,
        orgId: identity.orgId,
        userId: identity.userId,
        toolCallId: state.awaiting_approval.tool_call_id,
        toolArgs: state.awaiting_approval.tool_args,
      });
      await supabase.from("pending_background_jobs").insert({
        thread_id: threadId,
        tool_call_id: state.awaiting_approval.tool_call_id,
        org_id: identity.orgId,
        tool_name: "data-index",
        tool_args: state.awaiting_approval.tool_args,
        status: "dispatched",
        qstash_msg_id: msgId,
        dispatched_at: new Date().toISOString(),
      });
      await supabase.from("conversations").update({ run_status: "awaiting_tool" }).eq("thread_id", threadId);
      return Response.json({ type: "background_job_queued", qstash_message_id: msgId });
    }
    await supabase.from("conversations").update({
      run_status: "awaiting_tool",
      final_answer: "Approved. The write action is ready for provider execution.",
    }).eq("thread_id", threadId);
    return Response.json({ status: "approved", tool: state.awaiting_approval.tool_name });
  } catch (error) {
    return jsonError(error);
  }
}
