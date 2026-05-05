// ============================================================
// Salesforce Accounts fetcher (ATH-67)
//
// SOQL: SELECT Id, Name, Industry, Description FROM Account
// Returns FetchedChunk[] with cursor-based pagination.
// Content is ephemeral — only used for embedding, never stored.
// ============================================================

import { salesforceFetch } from './client'
import type { FetchedChunk } from '@/lib/integrations/base'

const SOQL = `SELECT+Id,Name,Industry,Description+FROM+Account`

export async function fetchSalesforceAccounts(
  connectionId: string,
  instanceUrl: string,
  orgId: string
): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = []
  let nextUrl: string | null = `/query?q=${SOQL}`

  while (nextUrl) {
    const data = await salesforceFetch(connectionId, nextUrl, orgId, instanceUrl) as {
      records: { Id: string; Name: string; Industry: string | null; Description: string | null }[]
      nextRecordsUrl?: string
      done: boolean
    }

    for (const record of data.records) {
      chunks.push({
        chunk_id:   `sf-account-${record.Id}`,
        title:      record.Name,
        content: [
          `Account: ${record.Name}`,
          record.Industry    ? `Industry: ${record.Industry}`       : null,
          record.Description ? `Description: ${record.Description}` : null,
        ].filter(Boolean).join('\n'),
        source_url: `${instanceUrl}/lightning/r/Account/${record.Id}/view`,
        metadata: {
          provider:    'salesforce',
          resource_type: 'accounts',
          id:          record.Id,
          industry:    record.Industry ?? null,
        },
      })
    }

    nextUrl = data.done ? null : (data.nextRecordsUrl ?? null)
  }

  return chunks
}