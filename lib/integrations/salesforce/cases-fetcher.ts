// ============================================================
// Salesforce Cases fetcher (ATH-67)
//
// SOQL: SELECT Id, Subject, Description, Status FROM Case
// Returns FetchedChunk[] with cursor-based pagination.
// ============================================================

import { salesforceFetch } from './client'
import type { FetchedChunk } from '@/lib/integrations/base'

const SOQL = `SELECT+Id,Subject,Description,Status+FROM+Case`

export async function fetchSalesforceCases(
  connectionId: string,
  instanceUrl: string,
  orgId: string
): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = []
  let nextUrl: string | null = `/query?q=${SOQL}`

  while (nextUrl) {
    const data = await salesforceFetch(connectionId, nextUrl, orgId, instanceUrl) as {
      records: { Id: string; Subject: string; Description: string | null; Status: string }[]
      nextRecordsUrl?: string
      done: boolean
    }

    for (const record of data.records) {
      chunks.push({
        chunk_id:   `sf-case-${record.Id}`,
        title:      record.Subject,
        content: [
          `Case: ${record.Subject}`,
          `Status: ${record.Status}`,
          record.Description ? `Description: ${record.Description}` : null,
        ].filter(Boolean).join('\n'),
        source_url: `${instanceUrl}/lightning/r/Case/${record.Id}/view`,
        metadata: {
          provider:    'salesforce',
          resource_type: 'cases',
          id:          record.Id,
          status:      record.Status,
        },
      })
    }

    nextUrl = data.done ? null : (data.nextRecordsUrl ?? null)
  }

  return chunks
}