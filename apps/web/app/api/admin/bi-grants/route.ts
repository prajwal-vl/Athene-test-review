import { requireAdmin, jsonError } from "@/lib/api/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getRedis } from "@/lib/redis/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { identity } = await requireAdmin(req);
    const body = await req.json();
    const userId = String(body.user_id || "");
    const deptIds = Array.isArray(body.granted_dept_ids) ? body.granted_dept_ids : [];
    if (!userId || deptIds.length === 0) return Response.json({ error: "user_id and granted_dept_ids are required" }, { status: 400 });
    const { data, error } = await createSupabaseServiceClient().from("bi_access_grants").insert({
      user_id: userId,
      org_id: identity.orgId,
      granted_dept_ids: deptIds,
      granted_by: identity.userId,
      expires_at: body.expires_at || null,
    }).select("id").single();
    if (error) throw error;
    await getRedis().del(`user_access:${userId}:${identity.orgId}`);
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { identity } = await requireAdmin(req);
    const grantId = new URL(req.url).searchParams.get("id");
    if (!grantId) return Response.json({ error: "id is required" }, { status: 400 });
    const { data: grant } = await createSupabaseServiceClient().from("bi_access_grants").select("user_id").eq("id", grantId).eq("org_id", identity.orgId).single();
    const { error } = await createSupabaseServiceClient().from("bi_access_grants").update({ is_active: false }).eq("id", grantId).eq("org_id", identity.orgId);
    if (error) throw error;
    if (grant?.user_id) await getRedis().del(`user_access:${grant.user_id}:${identity.orgId}`);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
