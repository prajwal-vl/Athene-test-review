/**
 * Maps Clerk organization roles to application internal roles.
 *
 * Clerk auth is handled by clerkMiddleware() in middleware.ts which
 * calls auth() — no manual JWT verification needed. This module
 * only exports the role-mapping helper used by the RBAC resolver.
 */
export function mapRole(orgRole?: string): "admin" | "member" | "super_user" | null {
  if (!orgRole) return null;

  switch (orgRole) {
    case "org:admin":
      return "admin";
    case "org:member":
      return "member";
    case "org:bi_analyst":
      return "super_user"; // Mapped to super_user for RLS grants
    default:
      return null;
  }
}
