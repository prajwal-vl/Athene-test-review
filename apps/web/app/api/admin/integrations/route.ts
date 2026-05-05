import { requireAdmin, jsonError } from "@/lib/api/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { identity } = await requireAdmin(req);
    const { data, error } = await createSupabaseServiceClient()
      .from("org_integrations")
      .select("id, dept_id, source_type, nango_connection_id, index_mode, visibility_default, last_synced_at, sync_status, is_active, created_at")
      .eq("org_id", identity.orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { identity } = await requireAdmin(req);
    const body = await req.json();
    const { data, error } = await createSupabaseServiceClient().from("org_integrations").insert({
      org_id: identity.orgId,
      dept_id: body.dept_id || null,
      source_type: body.source_type,
      nango_connection_id: body.nango_connection_id,
      index_mode: body.index_mode,
      visibility_default: body.visibility_default || "department",
    }).select("id").single();
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
    const { error } = await createSupabaseServiceClient().from("org_integrations").update({ is_active: false }).eq("id", id).eq("org_id", identity.orgId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
