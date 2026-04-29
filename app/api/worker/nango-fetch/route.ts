// ============================================================
// api/worker/nango-fetch/route.ts — Background fetch worker
//
// Called by QStash after dispatchThrottled() publishes a job.
// Flow:
//   1. Verify QStash signature (security)
//   2. Extract { orgId, connectionId, provider } from body
//   3. Look up the correct fetcher from providerFetcherMap
//   4. Call fetcher → get FetchedChunk[]
//   5. Pass each chunk through indexDocument()
//   6. Call releaseSlot() to free QStash concurrency
//
// Security rules:
//   • QStash signature verification required
//   • Nango token obtained inside fetcher, used once, discarded
//   • No tokens or raw content logged
// ============================================================

import { NextResponse } from 'next/server'
import { verifyQStashSignature } from '@/lib/qstash/verify'
import { releaseSlot, qstash } from '@/lib/qstash/client'
import { indexDocuments } from '@/lib/integrations/indexing'
import { logger } from '@/lib/logger'
import { fetchSlackMessages } from '@/lib/integrations/slack/channels-fetcher'
import { fetchZendeskTickets } from '@/lib/integrations/zendesk/tickets-fetcher'
import { fetchZendeskArticles } from '@/lib/integrations/zendesk/articles-fetcher'
import { fetchCalendarChunks } from '@/lib/integrations/google/calendar-fetcher'
import { fetchDriveChunks } from '@/lib/integrations/google/drive-fetcher'
import { searchEmailChunks } from '@/lib/integrations/google/gmail-fetcher'
import { fetchHubSpotCompanies } from '@/lib/integrations/hubspot/companies-fetcher'
import { fetchHubSpotContacts } from '@/lib/integrations/hubspot/contacts-fetcher'
import { fetchHubSpotDeals } from '@/lib/integrations/hubspot/deals-fetcher'
import { fetchHubSpotNotes } from '@/lib/integrations/hubspot/notes-fetcher'
import { fetchAllDatabases } from '@/lib/integrations/notion/databases-fetcher'
import { fetchAllPages } from '@/lib/integrations/notion/pages-fetcher'
import { fetchSalesforceAccounts } from '@/lib/integrations/salesforce/accounts-fetcher'
import { fetchSalesforceCases } from '@/lib/integrations/salesforce/cases-fetcher'
import { fetchSalesforceOpportunities } from '@/lib/integrations/salesforce/opportunities-fetcher'
import { fetchSnowflakeSamples } from '@/lib/integrations/snowflake/sample-fetcher'
import { githubIssuesFetcher } from '@/lib/integrations/github/issues-fetcher'
import { githubPrsFetcher } from '@/lib/integrations/github/prs-fetcher'
import { githubWikiFetcher } from '@/lib/integrations/github/wiki-fetcher'
import { linearIssuesFetcher } from '@/lib/integrations/linear/issues-fetcher'
import { linearCyclesFetcher } from '@/lib/integrations/linear/cycles-fetcher'
import { linearProjectsFetcher } from '@/lib/integrations/linear/projects-fetcher'
import { getProviderMetadata } from '@/lib/integrations/base'
import type { FetchedChunk } from '@/lib/integrations/base'
import { microsoftFetcher } from '@/lib/integrations/microsoft/index'
import { fetchJiraIssues } from '@/lib/integrations/atlassian/jira-fetcher'
import { fetchConfluencePages } from '@/lib/integrations/atlassian/confluence-fetcher'
import { getAppBaseUrl } from '@/lib/config/app-url'

// ---- Provider Fetcher Map ---------------------------------------

type FetcherFn = (
  connectionId: string,
  orgId: string,
  options?: { since?: string; limit?: number }
) => Promise<FetchedChunk[]>

/**
 * Map of provider names to their full-sync fetcher functions.
 * Each fetcher returns FetchedChunk[] for indexing.
 */
const providerFetcherMap: Record<string, FetcherFn[]> = {
  slack: [
    async (connectionId, orgId) => fetchSlackMessages(connectionId, orgId),
  ],

  zendesk: [
    async (connectionId, orgId) => {
      const metadata = await getProviderMetadata(connectionId, 'zendesk', orgId)
      const subdomain = metadata.subdomain

      if (!subdomain) {
        throw new Error(`Zendesk subdomain not found for connection ${connectionId}`)
      }

      const [tickets, articles] = await Promise.all([
        fetchZendeskTickets(connectionId, orgId, subdomain),
        fetchZendeskArticles(connectionId, orgId, subdomain),
      ])
      return [...tickets, ...articles]
    },
  ],

  'microsoft-graph': [microsoftFetcher],

  jira: [fetchJiraIssues],

  confluence: [fetchConfluencePages],
}

// ---- Request body type ------------------------------------------

interface NangoFetchJobBody {
  orgId: string
  connectionId: string
  provider: string           // 'slack' | 'zendesk' | 'google' | 'hubspot' | 'notion' | 'salesforce' | 'snowflake' | 'github' | 'linear'
  sourceType: string         // same as provider, used for QStash concurrency key
  departmentId?: string | null
  since?: string             // ISO-8601, for incremental sync
}

// ---- POST handler -----------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // 1. Verify QStash signature
  const isValid = await verifyQStashSignature(request)
  if (!isValid) {
    return new Response('Invalid QStash signature', { status: 401 })
  }

  let body: NangoFetchJobBody

  try {
    body = (await request.json()) as NangoFetchJobBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { orgId, connectionId, provider, sourceType, departmentId, since } = body

  // 2. Validate required fields
  if (!orgId || !connectionId || !provider) {
    return NextResponse.json(
      { error: 'Missing required fields: orgId, connectionId, provider' },
      { status: 400 }
    )
  }

  // 3. Look up the fetcher
  const fetchers = providerFetcherMap[provider]
  if (!fetchers) {
    return NextResponse.json(
      { error: `Unknown provider: ${provider}. Available: ${Object.keys(providerFetcherMap).join(', ')}` },
      { status: 400 }
    )
  }

  try {
    // 4. Run all fetchers for this provider
    const allChunks: FetchedChunk[] = []
    for (const fetcher of fetchers) {
      const chunks = await fetcher(connectionId, orgId, { since })
      allChunks.push(...chunks)
    }

    // 5. Index all fetched chunks (connectionId resolves/creates the documents row)
    const result = await indexDocuments(
      allChunks,
      orgId,
      connectionId,
      departmentId ?? null
    )

    // 6. Enqueue graph-build job if any chunks were indexed (ATH-44)
    //    Fire-and-forget: graph build runs asynchronously after embedding.
    if (result.indexed > 0) {
      const docIds = [...new Set(allChunks.map((c) => c.chunk_id))]
      const graphBuildUrl = `${getAppBaseUrl()}/api/worker/graph-build`
      try {
        await qstash.publishJSON({
          url: graphBuildUrl,
          body: {
            org_id: orgId,
            document_ids: docIds,
            job_type: 'incremental',
          },
        })
        console.log(
          `[nango-fetch] Enqueued graph-build for org=${orgId}, docs=${docIds.length}`,
        )
      } catch (gErr) {
        // Non-fatal: graph build will be triggered on next sync if this fails
        console.error('[nango-fetch] Failed to enqueue graph-build:', gErr)
      }
    }

    // 7. Release QStash concurrency slot
    await releaseSlot(orgId, sourceType || provider)

    return NextResponse.json({
      status: 'ok',
      provider,
      chunks_fetched: allChunks.length,
      chunks_indexed: result.indexed,
      errors: result.errors,
    })
  } catch (err) {
    logger.error(
      { provider, orgId, err: err instanceof Error ? err.message : String(err) },
      '[nango-fetch] Worker error'
    )

    // Still release the slot even on error to prevent deadlock
    try {
      await releaseSlot(orgId, sourceType || provider)
    } catch {
      // Best-effort release
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
