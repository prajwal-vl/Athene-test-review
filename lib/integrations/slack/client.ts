import { baseFetch, getProviderToken } from '@/lib/integrations/base'

/**
 * authenticated Slack API wrapper
 */
export async function slackFetch<T = unknown>(
  connectionId: string,
  orgId: string,
  endpoint: string, // e.g. 'conversations.list'
  params: Record<string, string> = {}
): Promise<T> {
  const token = await getProviderToken(connectionId, 'slack', orgId)
  const qs = new URLSearchParams(params).toString()
  const url = `https://slack.com/api/${endpoint}${qs ? `?${qs}` : ''}`

  const data = await baseFetch<T & { ok: boolean; error?: string }>(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!(data as any).ok) {
    throw new Error(`Slack API error on ${endpoint}: ${(data as any).error}`)
  }

  return data
}
