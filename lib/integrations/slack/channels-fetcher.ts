import { slackFetch } from './client'
import type { FetchedChunk } from '@/lib/integrations/base'

export async function fetchSlackMessages(
  connectionId: string,
  orgId: string
): Promise<FetchedChunk[]> {
  // Step 1: list all public channels
  const channels = await listChannels(connectionId, orgId)
  const allChunks: FetchedChunk[] = []

  // Step 2: for each channel, fetch messages
  for (const channel of channels) {
    const chunks = await fetchChannelMessages(connectionId, orgId, channel.id, channel.name)
    allChunks.push(...chunks)
  }

  return allChunks
}

async function listChannels(connectionId: string, orgId: string) {
  const channels: { id: string; name: string }[] = []
  let cursor: string | undefined

  while (true) {
    const res = await slackFetch<any>(connectionId, orgId, 'conversations.list', {
      exclude_archived: 'true',
      types: 'public_channel',
      limit: '200',
      ...(cursor ? { cursor } : {}),
    })
    channels.push(...res.channels.filter((c: any) => !c.is_archived))
    cursor = res.response_metadata?.next_cursor
    if (!cursor) break
  }
  return channels
}

async function fetchChannelMessages(
  connectionId: string,
  orgId: string,
  channelId: string,
  channelName: string
): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = []
  // only fetch last 30 days
  const oldest = String(Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60)
  let cursor: string | undefined

  while (true) {
    const res = await slackFetch<any>(connectionId, orgId, 'conversations.history', {
      channel: channelId,
      limit: '100',
      oldest,
      ...(cursor ? { cursor } : {}),
    })

    for (const msg of res.messages) {
      if (!msg.text?.trim()) continue

      // if message has thread replies, fetch and append them
      let content = msg.text
      if (msg.thread_ts && msg.reply_count > 0) {
        const replies = await slackFetch<any>(connectionId, orgId, 'conversations.replies', {
          channel: channelId, 
          ts: msg.thread_ts, 
          limit: '100',
        })
        const replyTexts = replies.messages.slice(1) // first is the parent
          .map((r: any) => ` → ${r.text}`)
          .join('\n')
        if (replyTexts) content = `${msg.text}\n\nThread replies:\n${replyTexts}`
      }

      chunks.push({
        chunk_id: `slack-msg-${channelId}-${msg.ts}`,
        title: `#${channelName}: ${msg.text.slice(0, 60)}${msg.text.length > 60 ? '...' : ''}`,
        content,
        source_url: `https://slack.com/archives/${channelId}/p${msg.ts.replace('.', '')}`,
        metadata: {
          provider: 'slack',
          resource_type: 'channel_message',
          channel_id: channelId,
          channel_name: channelName,
          author: msg.user ?? 'unknown',
          last_modified: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        },
      })
    }

    cursor = res.response_metadata?.next_cursor
    if (!cursor) break
  }
  return chunks
}
