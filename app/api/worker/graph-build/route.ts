// ============================================================
// app/api/worker/graph-build/route.ts — Graph build worker (ATH-60)
//
// QStash-triggered background job that builds/updates the
// knowledge graph after indexing completes.
//
// Payload:
//   { org_id, document_ids[], job_type: 'incremental' | 'full' }
//
// Flow:
//   1. Verify QStash signature (security)
//   2. Parse and validate payload
//   3. Call buildGraphForDocuments()
//   4. Return result summary
//
// Wired in by: app/api/worker/index-delta/route.ts (ATH-44)
//   → after embedding completes, enqueue graph-build with doc IDs.
//
// Security:
//   - QStash signature verified on every request
//   - org_id validated (non-empty string)
//   - Runs as service-role (storage.ts uses supabaseAdmin)
// ============================================================

import { NextResponse } from 'next/server'
import { verifyQStashSignature } from '@/lib/qstash/verify'
import { buildGraphForDocuments, type BuildMode } from '@/lib/knowledge-graph/builder'

// ---- Payload type -------------------------------------------

interface GraphBuildPayload {
  org_id: string
  document_ids?: string[]
  job_type?: BuildMode
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
  let payload: GraphBuildPayload
  try {
    payload = (await request.json()) as GraphBuildPayload
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const { org_id, document_ids = [], job_type = 'incremental' } = payload

  // 3. Validate required fields
  if (!org_id) {
    return NextResponse.json(
      { error: 'Missing required field: org_id' },
      { status: 400 },
    )
  }

  if (job_type !== 'incremental' && job_type !== 'full') {
    return NextResponse.json(
      { error: "job_type must be 'incremental' or 'full'" },
      { status: 400 },
    )
  }

  if (job_type === 'incremental' && document_ids.length === 0) {
    return NextResponse.json(
      { error: 'incremental mode requires at least one document_id' },
      { status: 400 },
    )
  }

  // 4. Build the graph
  try {
    console.log(
      `[graph-build] Starting ${job_type} build for org=${org_id}, docs=${document_ids.length}`,
    )

    const result = await buildGraphForDocuments(org_id, document_ids, job_type)

    console.log(
      `[graph-build] Done — processed=${result.processedDocs}, ` +
        `skipped=${result.skippedDocs}, nodes=${result.totalNodes}, ` +
        `edges=${result.totalEdges}, errors=${result.errors.length}`,
    )

    return NextResponse.json({
      status: 'ok',
      org_id,
      job_type,
      processed_docs: result.processedDocs,
      skipped_docs: result.skippedDocs,
      total_nodes: result.totalNodes,
      total_edges: result.totalEdges,
      errors: result.errors,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[graph-build] Fatal error for org=${org_id}:`, message)

    return NextResponse.json(
      { error: `Graph build failed: ${message}` },
      { status: 500 },
    )
  }
}
