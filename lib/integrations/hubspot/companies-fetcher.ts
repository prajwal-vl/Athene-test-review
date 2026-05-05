// ============================================================
// HubSpot Companies fetcher (ATH-67)
//
// GET /crm/v3/objects/companies with cursor-based pagination.
// Returns FetchedChunk[] — content is ephemeral, never stored.
// ============================================================

import { hubspotFetch } from './client'
import type { FetchedChunk } from '@/lib/integrations/base'

interface HubSpotCompany {
  id: string
  properties: {
    name: string | null
    domain: string | null
    industry: string | null
    description: string | null
  }
}

interface HubSpotResponse {
  results: HubSpotCompany[]
  paging?: { next?: { after: string } }
}

export async function fetchHubSpotCompanies(
  connectionId: string,
  orgId: string
): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = []
  let after: string | null = null

  while (true) {
    const qs = new URLSearchParams({
      limit: '100',
      properties: 'name,domain,industry,description',
      ...(after ? { after } : {}),
    })

    const data = await hubspotFetch(connectionId, `/crm/v3/objects/companies?${qs}`, orgId) as HubSpotResponse

    for (const record of data.results) {
      const p    = record.properties
      const name = p.name ?? 'Unnamed Company'

      chunks.push({
        chunk_id:   `hs-company-${record.id}`,
        title:      name,
        content: [
          `Company: ${name}`,
          p.domain      ? `Domain: ${p.domain}`           : null,
          p.industry    ? `Industry: ${p.industry}`       : null,
          p.description ? `Description: ${p.description}` : null,
        ].filter(Boolean).join('\n'),
        source_url: `https://app.hubspot.com/contacts/company/${record.id}`,
        metadata: {
          provider:    'hubspot',
          resource_type: 'companies',
          id:          record.id,
          domain:      p.domain ?? null,
          industry:    p.industry ?? null,
        },
      })
    }

    after = data.paging?.next?.after ?? null
    if (!after) break
  }

  return chunks
}