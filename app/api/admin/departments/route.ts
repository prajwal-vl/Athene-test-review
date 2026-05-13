import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { mapRole } from '@/lib/auth/clerk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { resolveOrgUuid } from '@/lib/auth/rbac'

/**
 * GET /api/admin/departments
 * Returns all departments for the authenticated admin's organisation.
 * Used to populate the department picker in the BI-grants UI.
 */
export async function GET() {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const orgUuid = await resolveOrgUuid(orgId)
  if (!orgUuid) return NextResponse.json({ departments: [] })

  const { data, error } = await supabaseAdmin
    .from('departments')
    .select('id, name, slug')
    .eq('org_id', orgUuid)
    .order('name', { ascending: true })

  if (error) {
    console.error('[admin/departments] fetch failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ departments: data ?? [] })
}
