// app/api/connections/sync/route.ts
//
// Triggers nango-fetch indexing jobs for a freshly-connected provider.
// Called by the integrations page immediately after Nango's "connect" event fires.
//
// #18 Fan-out: multi-resource providers (Google, Microsoft) dispatch one
// QStash job per worker key so each resource is indexed, retried, and
// throttled independently.
//
// QStash dispatches to /api/worker/nango-fetch which:
//   fetches chunks → embeds → upserts → enqueues graph-build

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { dispatchThrottled } from '@/lib/qstash/client'
import { getAppBaseUrl } from '@/lib/config/app-url'
import { PROVIDER_WORKER_KEYS } from '@/lib/integrations/providers'
import { resolveOrgUuid } from '@/lib/auth/rbac'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const orgUuid = await resolveOrgUuid(orgId)
  if (!orgUuid) return new NextResponse('Organization not found', { status: 403 })

  let body: { connectionId?: string; provider?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { connectionId, provider } = body
  if (!connectionId || !provider) {
    return NextResponse.json(
      { error: 'connectionId and provider are required' },
      { status: 400 },
    )
  }

  const url = `${getAppBaseUrl()}/api/worker/nango-fetch`

  // Fan out: look up the worker-level keys for this provider.
  // e.g. 'google' → ['google-drive', 'gmail', 'google-calendar']
  //      'slack'  → ['slack']
  const workerKeys: string[] =
    (PROVIDER_WORKER_KEYS as Record<string, string[]>)[provider] ?? [provider]

  const results = await Promise.all(
    workerKeys.map((workerKey) =>
      dispatchThrottled({
        orgId: orgUuid,
        sourceType: workerKey,
        url,
        body: { orgId: orgUuid, connectionId, provider: workerKey },
      }),
    ),
  )

  const allQueued = results.every((r) => !r.dispatched)
  if (allQueued) {
    // All jobs throttled — queued in pending_background_jobs
    return NextResponse.json({ queued: true, dispatched: false, workerKeys })
  }

  const msgIds = results.flatMap((r) => (r.msgId ? [r.msgId] : []))
  return NextResponse.json({ dispatched: true, msgIds, workerKeys })
}
