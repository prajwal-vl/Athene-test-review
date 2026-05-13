import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { mapRole } from '@/lib/auth/clerk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { redis } from '@/lib/redis/client'
import { resolveOrgUuid } from '@/lib/auth/rbac'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GrantRow {
  id: string
  is_active: boolean
  expires_at: string | null
  created_at: string
  org_members: {
    id: string
    clerk_user_id: string
    email: string
    display_name: string | null
  } | null
  departments: {
    id: string
    name: string
  } | null
}

// ---------------------------------------------------------------------------
// GET  /api/admin/bi-grants
// Returns all BI access grants for the org, joined with member + dept names.
// ---------------------------------------------------------------------------

export async function GET() {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const orgUuid = await resolveOrgUuid(orgId)
  if (!orgUuid) return NextResponse.json({ grants: [] })

  const { data, error } = await supabaseAdmin
    .from('bi_access_grants')
    .select(`
      id,
      is_active,
      expires_at,
      created_at,
      org_members!user_id ( id, clerk_user_id, email, display_name ),
      departments!dept_id ( id, name )
    `)
    .eq('org_id', orgUuid)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[bi-grants] GET failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Normalise the nested objects into a flat, UI-friendly shape
  const grants = ((data ?? []) as unknown as GrantRow[]).map((g) => ({
    id: g.id,
    is_active: g.is_active,
    expires_at: g.expires_at,
    created_at: g.created_at,
    user_id: g.org_members?.id ?? null,
    clerk_user_id: g.org_members?.clerk_user_id ?? null,
    user_email: g.org_members?.email ?? 'Unknown',
    user_display_name: g.org_members?.display_name ?? null,
    dept_id: g.departments?.id ?? null,
    dept_name: g.departments?.name ?? 'Unknown',
  }))

  return NextResponse.json({ grants })
}

// ---------------------------------------------------------------------------
// POST  /api/admin/bi-grants
// Body: { user_id: string (org_members UUID), dept_id: string (UUID),
//         dept_name?: string, expires_at?: string }
//
// Validation order:
//  1. Caller is an admin of the org.
//  2. Target user_id belongs to an active member of this org (Clerk-verified).
//  3. dept_id belongs to this org.
//  4. If dept_name is supplied, it must match the stored name (case-insensitive).
//  5. Insert (UNIQUE constraint prevents duplicates — re-granting is idempotent).
//  6. Invalidate the target user's RBAC cache so the grant takes effect
//     immediately without waiting for the 5-minute TTL.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const orgUuid = await resolveOrgUuid(orgId)
  if (!orgUuid) return new NextResponse('Organization not found', { status: 403 })

  // --- Parse body -----------------------------------------------------------
  let body: { user_id?: string; dept_id?: string; dept_name?: string; expires_at?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.user_id || !body.dept_id) {
    return NextResponse.json(
      { error: 'user_id (org_member UUID) and dept_id are required' },
      { status: 400 },
    )
  }

  // --- 1. Validate target member is a real, active Clerk-verified org member -
  const { data: member, error: memberErr } = await supabaseAdmin
    .from('org_members')
    .select('id, clerk_user_id, email, active')
    .eq('id', body.user_id)
    .eq('org_id', orgUuid)
    .single()

  if (memberErr || !member) {
    return NextResponse.json(
      { error: 'User not found in this organisation' },
      { status: 404 },
    )
  }
  if (!member.active) {
    return NextResponse.json(
      { error: 'Cannot grant access to a deactivated user' },
      { status: 400 },
    )
  }

  // --- 2. Validate department belongs to this org ---------------------------
  const { data: dept, error: deptErr } = await supabaseAdmin
    .from('departments')
    .select('id, name')
    .eq('id', body.dept_id)
    .eq('org_id', orgUuid)
    .single()

  if (deptErr || !dept) {
    return NextResponse.json(
      { error: 'Department not found in this organisation' },
      { status: 404 },
    )
  }

  // --- 3. If dept_name provided, validate it matches (case-insensitive) -----
  if (body.dept_name && dept.name.toLowerCase() !== body.dept_name.trim().toLowerCase()) {
    return NextResponse.json(
      {
        error: `Department name mismatch: expected "${dept.name}", got "${body.dept_name}"`,
      },
      { status: 400 },
    )
  }

  // --- 4. Resolve the granting admin's org_member row (for created_by) ------
  const { data: adminMember } = await supabaseAdmin
    .from('org_members')
    .select('id')
    .eq('clerk_user_id', userId)
    .eq('org_id', orgUuid)
    .single()

  // --- 5. Insert (UNIQUE constraint makes this idempotent) ------------------
  const { data: grant, error: insertErr } = await supabaseAdmin
    .from('bi_access_grants')
    .upsert(
      {
        org_id: orgUuid,
        user_id: body.user_id,
        dept_id: body.dept_id,
        is_active: true,
        expires_at: body.expires_at ? new Date(body.expires_at).toISOString() : null,
        created_by: adminMember?.id ?? null,
      },
      { onConflict: 'org_id,user_id,dept_id' },
    )
    .select('id')
    .single()

  if (insertErr) {
    console.error('[bi-grants] POST insert failed:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // --- 6. Evict RBAC cache for the target user so grant is immediate --------
  // Cache key in rbac.ts: `user_access:${clerkUserId}:${clerkOrgId}`
  await redis.del(`user_access:${member.clerk_user_id}:${orgId}`).catch(() => null)

  console.info(
    `[bi-grants] Granted dept "${dept.name}" (${dept.id}) to ${member.email} by admin ${userId}`,
  )

  return NextResponse.json({ grant })
}

// ---------------------------------------------------------------------------
// DELETE  /api/admin/bi-grants
// Body: { id: string (grant UUID) }
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const orgUuid = await resolveOrgUuid(orgId)
  if (!orgUuid) return new NextResponse('Organization not found', { status: 403 })

  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.id) return NextResponse.json({ error: 'Missing grant id' }, { status: 400 })

  // Fetch grant first so we can get the clerk_user_id for cache eviction
  const { data: existing } = await supabaseAdmin
    .from('bi_access_grants')
    .select('user_id, org_members!user_id ( clerk_user_id )')
    .eq('id', body.id)
    .eq('org_id', orgUuid)
    .single()

  const { error } = await supabaseAdmin
    .from('bi_access_grants')
    .delete()
    .eq('id', body.id)
    .eq('org_id', orgUuid)

  if (error) {
    console.error('[bi-grants] DELETE failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Evict cache for the affected user
  const clerkUserId =
    existing && (existing as any).org_members?.clerk_user_id
  if (clerkUserId) {
    await redis.del(`user_access:${clerkUserId}:${orgId}`).catch(() => null)
  }

  return NextResponse.json({ deleted: true })
}
