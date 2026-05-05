import { verifyQStashRequest } from "@/lib/qstash/verify";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQStashRequest(req, raw))) return Response.json({ error: "Invalid QStash signature" }, { status: 401 });
  const body = JSON.parse(raw);
  const { data, error } = await createSupabaseServiceClient()
    .from("org_integrations")
    .select("id, org_id, source_type, delta_token")
    .eq("is_active", true)
    .eq("sync_status", "idle");
  if (error) throw error;
  return Response.json({ integrations_ready_for_delta: data, requested_by: body.schedule_id || null });
}
