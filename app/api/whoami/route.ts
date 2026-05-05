import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveUserAccess } from '@/lib/auth/rbac'

export async function GET() {
  const { userId, orgId, orgRole } = await auth()

  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await resolveUserAccess(userId, orgId, orgRole)

  return NextResponse.json({
    user_id: userId,
    org_id: orgId,
    org_role: orgRole,
    access,
  })
}
