import { requireAdmin, jsonError } from "@/lib/api/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getQStashClient } from "@/lib/qstash/client";
import { requireEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { identity } = await requireAdmin(req);
    const body = await req.json();
    const schedule = await getQStashClient().schedules.create({
      destination: `${requireEnv("NEXT_PUBLIC_APP_URL")}/api/worker/morning-briefing`,
      cron: String(body.cron_expression),
      body: JSON.stringify({ org_id: identity.orgId, user_id: body.user_id || identity.userId, inputs: body.config || {} }),
    });
    const { data, error } = await createSupabaseServiceClient().from("user_automations").insert({
      user_id: body.user_id || identity.userId,
      org_id: identity.orgId,
      automation_type: body.automation_type || "morning_briefing",
      cron_expression: body.cron_expression,
      timezone: body.timezone || "UTC",
      config: body.config || {},
      qstash_schedule_id: schedule.scheduleId,
    }).select("id, qstash_schedule_id").single();
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { identity } = await requireAdmin(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase.from("user_automations").select("qstash_schedule_id").eq("id", id).eq("org_id", identity.orgId).single();
    if (data?.qstash_schedule_id) await getQStashClient().schedules.delete(data.qstash_schedule_id);
    const { error } = await supabase.from("user_automations").update({ is_active: false }).eq("id", id).eq("org_id", identity.orgId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
