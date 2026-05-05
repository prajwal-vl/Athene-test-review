/**
 * Atlassian API client (Jira & Confluence) — Step 1 & 3 implementation.
 * Handles OAuth token retrieval via Nango and provides a base fetcher for Atlassian products.
 */
import { baseFetch, getProviderToken } from '../base'

/**
 * Atlassian Site (Cloud) ID lookup.
 * A single Atlassian connection (Nango) can have multiple sites.
 * We usually pick the first one unless specified.
 */
export async function getCloudId(
  connectionId: string, 
  orgId: string,
  product: 'jira' | 'confluence' = 'jira'
): Promise<string> {
  const token = await getProviderToken(connectionId, product, orgId)
  
  const data = await baseFetch<any[]>(
    'https://api.atlassian.com/oauth/token/accessible-resources',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!data || data.length === 0) {
    throw new Error(`Atlassian API: No accessible resources found for ${product}`)
  }

  // Returns the first resource ID (cloudId)
  return data[0].id
}

/**
 * Authenticated fetch wrapper for Atlassian APIs.
 * Automatically handles token retrieval, site-specific URL construction,
 * and shared retry/rate-limit logic via baseFetch.
 */
export async function atlassianFetch<T = any>(
  connectionId: string,
  cloudId: string,
  endpoint: string,
  orgId: string,
  product: 'jira' | 'confluence' = 'jira',
  options: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const token = await getProviderToken(connectionId, product, orgId)
  
  const baseUrl = product === 'jira'
    ? `https://api.atlassian.com/ex/jira/${cloudId}`
    : `https://api.atlassian.com/ex/confluence/${cloudId}` // Confluence uses a different base for some APIs, but standard OAuth uses this

  // Note: Confluence Cloud APIs often use /wiki/rest/api/...
  // Jira Cloud APIs often use /rest/api/3/...
  const url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`

  return baseFetch<T>(url, {
    method: options.method || 'GET',
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: options.body,
  })
}
