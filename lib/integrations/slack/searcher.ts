import { slackFetch } from './client'
import type { FetchedChunk } from '@/lib/integrations/base'

/**
 * live search via search.messages API
 */
export async function searchSlack(
  connectionId: string,
  orgId: string,
  query: string,
  limit = 20
): Promise<FetchedChunk[]> {
  const res = await slackFetch<any>(connectionId, orgId, 'search.messages', {
    query,
    count: String(limit),
    sort: 'timestamp',
    sort_dir: 'desc',
  })

  return (res.messages?.matches ?? []).map((match: any) => ({
    chunk_id: `slack-search-${match.channel.id}-${match.ts}`,
    title: `#${match.channel.name}: ${match.text.slice(0, 60)}...`,
    content: match.text,
    source_url: match.permalink,
    metadata: {
      provider: 'slack',
      resource_type: 'search_result',
      channel_name: match.channel.name,
      author: match.username ?? 'unknown',
    },
  }))
}
