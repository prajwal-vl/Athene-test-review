import { verifyQStashRequest } from "@/lib/qstash/verify";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveModelClient } from "@/lib/langgraph/llm-factory";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQStashRequest(req, raw))) return Response.json({ error: "Invalid QStash signature" }, { status: 401 });
  const body = JSON.parse(raw);
  const orgId = String(body.org_id || "");
  const userId = String(body.user_id || "");
  if (!orgId || !userId) return Response.json({ error: "org_id and user_id are required" }, { status: 400 });
  const llm = await resolveModelClient(orgId, "medium");
  const result = await llm.invoke([
    ["system", "Create a concise morning briefing only from provider summaries supplied by workers. Do not invent missing items."],
    ["human", JSON.stringify(body.inputs || {})],
  ]);
  const threadId = crypto.randomUUID();
  const { error } = await createSupabaseServiceClient().from("conversations").insert({
    thread_id: threadId,
    org_id: orgId,
    user_id: userId,
    prompt: "morning briefing",
    final_answer: String(result.content),
    run_status: "complete",
    completed_at: new Date().toISOString(),
  });
  if (error) throw error;
  return Response.json({ ok: true, thread_id: threadId });
}
