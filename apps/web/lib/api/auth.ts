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
  let code = status;

  if (error instanceof Error) {
    if (error.name === "ForbiddenError") code = 403;
    // Map Clerk/Token errors to 401
    if (
      message.toLowerCase().includes("token") || 
      message.toLowerCase().includes("claims") || 
      message.toLowerCase().includes("authorized") ||
      message.toLowerCase().includes("authenticated")
    ) {
      code = 401;
    }
  }

  return Response.json({ error: message }, { status: code });
}
