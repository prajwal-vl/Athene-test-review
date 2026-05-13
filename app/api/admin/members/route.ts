import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { mapRole } from '@/lib/auth/clerk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveOrgUuid } from '@/lib/auth/rbac'

/**
 * GET /api/admin/members
 * Returns all active org members for the authenticated admin's organisation.
 * Sourced from the org_members table (provisioned by Clerk webhooks).
 * Used to populate the member picker in the BI-grants UI.
 */
export async function GET() {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const orgUuid = await resolveOrgUuid(orgId)
  if (!orgUuid) return NextResponse.json({ members: [] })

  const { data, error } = await supabaseAdmin
    .from('org_members')
    .select('id, clerk_user_id, email, display_name, role, department_id')
    .eq('org_id', orgUuid)
    .eq('active', true)
    .order('email', { ascending: true })

  if (error) {
    console.error('[admin/members] fetch failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ members: data ?? [] })
}
