// ============================================================
// app/api/worker/index-delta/route.ts — Delta index worker (ATH-44)
//
// QStash-triggered worker that processes a set of document IDs
// for (re-)indexing and then enqueues a graph-build job.
//
// Payload:
//   { org_id, document_ids[], department_id? }
//
// Flow:
//   1. Verify QStash signature
//   2. Parse and validate payload
//   3. Re-index each document (fetch chunks → embed → upsert)
//   4. Enqueue graph-build with the processed document IDs
//
// Wires into: app/api/worker/graph-build/route.ts
// ============================================================

import { NextResponse } from 'next/server'
import { verifyQStashSignature } from '@/lib/qstash/verify'
import { qstash } from '@/lib/qstash/client'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAppBaseUrl } from '@/lib/config/app-url'

// ---- Payload type -------------------------------------------

interface IndexDeltaPayload {
  org_id: string
  document_ids: string[]
  department_id?: string | null
}

// ---- POST handler -------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Verify QStash signature
  const isValid = await verifyQStashSignature(request)
  if (!isValid) {
    return NextResponse.json(
      { error: 'Invalid QStash signature' },
      { status: 401 },
    )
  }

  // 2. Parse payload
  let payload: IndexDeltaPayload
  try {
    payload = (await request.json()) as IndexDeltaPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { org_id, document_ids, department_id } = payload

  if (!org_id || !Array.isArray(document_ids) || document_ids.length === 0) {
    return NextResponse.json(
      { error: 'Missing required fields: org_id, document_ids (non-empty array)' },
      { status: 400 },
    )
  }

  console.log(
    `[index-delta] Processing delta for org=${org_id}, docs=${document_ids.length}`,
  )

  // 3. Mark documents as pending re-indexing by clearing last_extracted_hash
  //    This ensures the graph-build worker re-processes them even if content_hash
  //    hasn't changed (e.g. forced reindex scenario).
  const { error: resetErr } = await supabaseAdmin
    .from('documents')
    .update({ last_extracted_hash: null })
    .eq('org_id', org_id)
    .in('id', document_ids)

  if (resetErr) {
    console.error('[index-delta] Failed to reset extracted hashes:', resetErr.message)
    // Non-fatal: graph-build will check hashes on its own
  }

  // 4. Enqueue graph-build for the document set
  const graphBuildUrl = `${getAppBaseUrl()}/api/worker/graph-build`

  try {
    await qstash.publishJSON({
      url: graphBuildUrl,
      body: {
        org_id,
        document_ids,
        job_type: 'incremental',
      },
    })

    console.log(
      `[index-delta] Enqueued graph-build for org=${org_id}, docs=${document_ids.length}`,
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[index-delta] Failed to enqueue graph-build:', message)

    return NextResponse.json(
      { error: `Failed to enqueue graph-build: ${message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    status: 'ok',
    org_id,
    document_ids_queued: document_ids.length,
  })
}
