import { verifyClerkJWT } from "@/lib/auth/clerk";
import { resolveUserAccess, assertAdmin } from "@/lib/auth/rbac";

export async function requireIdentity(req: Request) {
  const identity = await verifyClerkJWT(req.headers.get("authorization"));
  const access = await resolveUserAccess(identity.userId, identity.orgId, identity.orgRole);
  return { identity, access };
}

export async function requireAdmin(req: Request) {
  const auth = await requireIdentity(req);
  assertAdmin(auth.access);
  return auth;
}

export function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const code = error instanceof Error && error.name === "ForbiddenError" ? 403 : status;
  return Response.json({ error: message }, { status: code });
}
