import { zendeskFetch } from './client'
import type { FetchedChunk } from '@/lib/integrations/base'

export async function fetchZendeskTickets(
  connectionId: string,
  orgId: string,
  subdomain: string
): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = []
  let nextPath: string | null = '/tickets.json?per_page=100&sort_by=updated_at'

  while (nextPath) {
    // Zendesk next_page is a full URL — strip the base to get just the path
    const path: string = nextPath.startsWith('http')
      ? nextPath.replace(`https://${subdomain}.zendesk.com/api/v2`, '')
      : nextPath

    const res = await zendeskFetch<any>(connectionId, orgId, subdomain, path)

    for (const ticket of res.tickets) {
      // fetch public comments for this ticket
      const commentsRes = await zendeskFetch<any>(
        connectionId, orgId, subdomain, `/tickets/${ticket.id}/comments.json`
      )
      const publicComments = commentsRes.comments
        .filter((c: any) => c.public)
        .map((c: any) => c.body)
        .join('\n---\n')

      chunks.push({
        chunk_id: `zendesk-ticket-${ticket.id}`,
        title: `Ticket #${ticket.id}: ${ticket.subject}`,
        content: [
          `Ticket #${ticket.id}: ${ticket.subject}`,
          `Status: ${ticket.status}`,
          ticket.priority ? `Priority: ${ticket.priority}` : null,
          '',
          ticket.description,
          publicComments ? `\nComments:\n${publicComments}` : null,
        ].filter(Boolean).join('\n'),
        source_url: ticket.url
          .replace('/api/v2/tickets/', '/agent/tickets/')
          .replace('.json', ''),
        metadata: {
          provider: 'zendesk',
          resource_type: 'ticket',
          ticket_id: ticket.id,
          status: ticket.status,
          priority: ticket.priority ?? 'none',
          last_modified: ticket.updated_at,
        },
      })
    }

    nextPath = res.next_page
  }
  return chunks
}
