import { verifyToken } from '@clerk/nextjs/server'

export type AppRole = 'admin' | 'member' | 'bi_analyst'

export function mapRole(orgRole?: string | null): AppRole | null {
  if (!orgRole) return null

  switch (orgRole) {
    case 'org:admin':
      return 'admin'
    case 'org:member':
      return 'member'
    case 'org:bi_analyst':
      return 'bi_analyst'
    default:
      return null
  }
}

export async function verifyClerkJWT(authHeader: string) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response('Missing bearer token', { status: 401 })
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) throw new Response('Missing bearer token', { status: 401 })

  try {
    const payload = await verifyToken(token)
    return {
      userId: payload.sub ?? '',
      orgId: (payload as Record<string, unknown>).org_id as string | undefined,
      orgRole: (payload as Record<string, unknown>).org_role as string | undefined,
      email: (payload as Record<string, unknown>).email as string | undefined,
    }
  } catch {
    throw new Response('Invalid token', { status: 403 })
  }
}
