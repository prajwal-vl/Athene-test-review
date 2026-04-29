// ============================================================
// Salesforce Opportunities fetcher (ATH-67)
//
// SOQL: SELECT Id, Name, StageName, Description FROM Opportunity
// Returns FetchedChunk[] with cursor-based pagination.
// ============================================================

import { salesforceFetch } from './client'
import type { FetchedChunk } from '@/lib/integrations/base'

const SOQL = `SELECT+Id,Name,StageName,Description+FROM+Opportunity`

export async function fetchSalesforceOpportunities(
  connectionId: string,
  instanceUrl: string,
  orgId: string
): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = []
  let nextUrl: string | null = `/query?q=${SOQL}`

  while (nextUrl) {
    const data = await salesforceFetch(connectionId, nextUrl, orgId, instanceUrl) as {
      records: { Id: string; Name: string; StageName: string; Description: string | null }[]
      nextRecordsUrl?: string
      done: boolean
    }

    for (const record of data.records) {
      chunks.push({
        chunk_id:   `sf-opportunity-${record.Id}`,
        title:      record.Name,
        content: [
          `Opportunity: ${record.Name}`,
          `Stage: ${record.StageName}`,
          record.Description ? `Description: ${record.Description}` : null,
        ].filter(Boolean).join('\n'),
        source_url: `${instanceUrl}/lightning/r/Opportunity/${record.Id}/view`,
        metadata: {
          provider:    'salesforce',
          resource_type: 'opportunities',
          id:          record.Id,
          stage:       record.StageName,
        },
      })
    }

    nextUrl = data.done ? null : (data.nextRecordsUrl ?? null)
  }

  return chunks
}