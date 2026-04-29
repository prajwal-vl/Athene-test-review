import { zendeskFetch } from './client'
import type { FetchedChunk } from '@/lib/integrations/base'

/**
 * live search via Zendesk search API
 */
export async function searchZendesk(
  connectionId: string,
  orgId: string,
  subdomain: string,
  query: string,
  limit = 20
): Promise<FetchedChunk[]> {
  const res = await zendeskFetch<any>(
    connectionId, orgId, subdomain,
    `/search.json?query=${encodeURIComponent(query)}&per_page=${limit}`
  )

  return (res.results ?? []).map((result: any) => {
    const isTicket = result.result_type === 'ticket'
    return {
      chunk_id: `zendesk-search-${result.result_type}-${result.id}`,
      title: isTicket ? `Ticket #${result.id}: ${result.subject}` : result.title,
      content: isTicket ? (result.description ?? '') : (result.body ?? ''),
      source_url: result.html_url ?? result.url,
      metadata: {
        provider: 'zendesk',
        resource_type: isTicket ? 'ticket' : 'help_center_article',
        status: result.status ?? null,
        last_modified: result.updated_at,
      },
    }
  })
}
