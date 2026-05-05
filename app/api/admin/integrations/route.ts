import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { mapRole } from '@/lib/auth/clerk'
import { listConnections, deleteConnection } from '@/lib/nango/client'
import { PROVIDER_REGISTRY } from '@/lib/integrations/providers'

export async function GET(_req: NextRequest) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const connections = await listConnections(orgId)

  const integrations = (connections as any[]).map((conn) => {
    const providerKey = (conn.provider_config_key ?? conn.provider) as string
    const config = PROVIDER_REGISTRY[providerKey as keyof typeof PROVIDER_REGISTRY]
    return {
      connectionId: conn.connection_id ?? conn.id,
      provider: providerKey,
      displayName: config?.displayName ?? providerKey,
      category: config?.category ?? 'other',
      resources: config?.resources ?? [],
      status: conn.errors?.length ? 'error' : 'connected',
      createdAt: conn.created_at ?? null,
    }
  })

  return NextResponse.json({ integrations })
}

export async function DELETE(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  let body: { connectionId?: string; provider?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { connectionId, provider } = body
  if (!connectionId || !provider) {
    return NextResponse.json({ error: 'connectionId and provider are required' }, { status: 400 })
  }

  await deleteConnection(connectionId, provider, orgId)
  return NextResponse.json({ success: true })
}
