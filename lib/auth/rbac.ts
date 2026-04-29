/**
 * RBAC Access Resolver
 * Resolves user roles and departmental access.
 * Caches results in Redis for performance.
 * Uses provided Clerk role as fallback if Supabase misses/fails.
 */

import { redis } from "@/lib/redis/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { mapRole } from "./clerk";

export type UserRole = "admin" | "super_user" | "member" | null;

export interface UserAccess {
  internal_user_id: string | null;
  role: UserRole;
  dept_id: string | null;
  accessible_dept_ids: string[] | null;
  bi_grant_id: string | null;
}

const RBAC_CACHE_TTL_SECONDS = 60;
const USER_ACCESS_CACHE_PREFIX = "user_access";

function makeCacheKey(userId: string, orgId: string) {
  return `${USER_ACCESS_CACHE_PREFIX}:${userId}:${orgId}`;
}

function normalizeDeptIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return value.split(",").map((part) => part.trim()).filter(Boolean);
    }
  }

  return [];
}

/**
 * Resolves user access levels.
 * @param clerkRole Optional pre-resolved role from Clerk (e.g. from auth() in middleware)
 */
export async function resolveUserAccess(
  userId: string,
  orgId: string,
  clerkRole?: string | null
): Promise<UserAccess> {
  const cacheKey = makeCacheKey(userId, orgId);

  try {
    const cached = await redis.get(cacheKey);
    if (typeof cached === "string") {
      return JSON.parse(cached) as UserAccess;
    }
  } catch (error) {
    // Cache miss or failure is fine
  }

  let result: UserAccess | null = null;

  // 1. Try Supabase
  try {
    // Resolve internal org UUID from Clerk org ID
    const { data: orgData } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("clerk_org_id", orgId)
      .single();

    if (orgData) {
      const { data, error } = await supabaseAdmin
        .from("org_members")
        .select("id, department_id, role, access_grants(id, scope_type, scope_id, expires_at)")
        .eq("clerk_user_id", userId)
        .eq("org_id", orgData.id)
        .single();

      if (error && !error.message.includes("fetch failed") && error.code !== "PGRST116") {
        console.warn(`RBAC Supabase query failed: ${error.message}`);
      }

      if (data) {
        type AccessGrant = { id: string; scope_type: string; scope_id: string; expires_at: string | null };
        const grants: AccessGrant[] = Array.isArray(data.access_grants) ? (data.access_grants as AccessGrant[]) : [];
        const now = new Date();
        const activeGrants = grants.filter(
          (g) => !g.expires_at || new Date(g.expires_at) > now
        );

        const accessible_dept_ids = activeGrants
          .filter((g) => g.scope_type === "department")
          .map((g) => g.scope_id)
          .filter((val, idx, self) => self.indexOf(val) === idx);

        result = {
          internal_user_id: data.id,
          role: data.role,
          dept_id: data.department_id,
          accessible_dept_ids: accessible_dept_ids.length ? accessible_dept_ids : null,
          bi_grant_id: activeGrants[0]?.id ?? null,
        };
      }
    }
  } catch (dbError) {
    // Non-fatal
  }

  // 2. Fallback to Clerk role
  if (!result || !result.role) {
    const mappedRole = mapRole(clerkRole || undefined);
    
    result = {
      internal_user_id: result?.internal_user_id ?? null,
      role: mappedRole,
      dept_id: result?.dept_id ?? null,
      accessible_dept_ids: result?.accessible_dept_ids ?? null,
      bi_grant_id: result?.bi_grant_id ?? null,
    };
  }

  // 3. Defaults
  if (!result) {
    result = {
      internal_user_id: null,
      role: null,
      dept_id: null,
      accessible_dept_ids: null,
      bi_grant_id: null,
    };
  }

  // 4. Cache
  try {
    await redis.set(cacheKey, JSON.stringify(result), { ex: RBAC_CACHE_TTL_SECONDS });
  } catch (err) {
    // Non-fatal
  }

  return result;
}
