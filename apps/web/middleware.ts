import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { resolveUserAccess } from "@/lib/auth/rbac";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/auth/clerk";

// Define routes that should NOT be protected
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/worker(.*)",
])

function normalizeClerkRole(role: string | null | undefined): UserRole {
    if (!role) return "member";
    if (role === "org:admin" || role === "admin") return "admin";
    if (role === "org:bi_analyst" || role === "bi_analyst") return "bi_analyst";
    return "member";
}

/**
 * Clerk Middleware
 * Handles authentication and resolves RBAC context to inject as headers.
 */
export default clerkMiddleware(async (auth, request) => {
  const { userId, orgId, orgRole } = await auth();

  // 1. Enforce Authentication for non-public routes
  if (!isPublicRoute(request)) {
    if (!userId) {
      return (await auth()).redirectToSignIn();
    }
  }

  // 2. Resolve RBAC if we have a user and org context
  if (userId && orgId) {
    try {
      const role = normalizeClerkRole(orgRole as string);
      const access = await resolveUserAccess(userId, orgId, role);

      const requestHeaders = new Headers(request.headers);

      // Inject RBAC context into headers for downstream API/Server Components
      requestHeaders.set("x-current-user-id", userId);
      requestHeaders.set("x-current-user-role", access.role || "member");

      if (access.deptId) requestHeaders.set("x-current-user-dept-id", access.deptId);
      if (access.accessibleDeptIds) {
        requestHeaders.set("x-current-accessible-depts", JSON.stringify(access.accessibleDeptIds));
      }
      if (access.biGrantId) requestHeaders.set("x-current-bi-grant-id", access.biGrantId);

      requestHeaders.set("x-current-org-id", orgId);
      requestHeaders.set("x-clerk-user-id", userId);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (error) {
      console.error("Middleware RBAC resolution failed:", error);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
