import { baseFetch, getProviderToken } from '@/lib/integrations/base'

/**
 * authenticated Zendesk API wrapper
 */
export async function zendeskFetch<T = unknown>(
  connectionId: string,
  orgId: string,
  subdomain: string,
  path: string // e.g. '/tickets.json'
): Promise<T> {
  const token = await getProviderToken(connectionId, 'zendesk', orgId)
  const url = `https://${subdomain}.zendesk.com/api/v2${path}`
  return baseFetch<T>(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
}
