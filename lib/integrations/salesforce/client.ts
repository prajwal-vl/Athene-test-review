// ============================================================
// Salesforce base client (ATH-67)
//
// Uses baseFetch<T>() for retry + rate-limit handling.
// Critical rule: token is fetched from Nango per-request,
// used once, then falls out of scope. Never stored, never logged.
// ============================================================

import { baseFetch, getProviderToken, type BaseFetchOptions } from '@/lib/integrations/base'
import { getConnectionMetadata } from '@/lib/nango/client'

/**
 * Make an authenticated GET request to the Salesforce REST API.
 *
 * @param connectionId – Nango connection ID for this org's Salesforce link
 * @param path – API path appended to `/services/data/v59.0` (e.g. `/query?q=...`)
 * @param orgId – Clerk org ID for ownership verification
 * @param instanceUrl – Salesforce instance URL (e.g. `https://myorg.my.salesforce.com`).
 *   If omitted, fetches it dynamically from Nango connection metadata.
 * @param fetchOptions – Optional retry/method configuration passed to baseFetch
 */
export async function salesforceFetch<T = unknown>(
  connectionId: string,
  path: string,
  orgId: string,
  instanceUrl?: string,
  fetchOptions?: BaseFetchOptions
): Promise<T> {
  let baseUrl = instanceUrl
  
  if (!baseUrl) {
    try {
      const conn = await getConnectionMetadata(connectionId, 'salesforce', orgId)
      baseUrl = conn.metadata?.instance_url || conn.credentials?.instance_url || conn.connection_config?.instance_url || 'https://login.salesforce.com'
    } catch (err) {
      console.warn(`[salesforceFetch] Failed to fetch instance_url from Nango metadata, falling back to login.salesforce.com:`, err)
      baseUrl = 'https://login.salesforce.com'
    }
  }

  const url = `${baseUrl}/services/data/v59.0${path}`
  const token = await getProviderToken(connectionId, 'salesforce', orgId)

  const headers = {
    ...fetchOptions?.headers,
    Authorization: `Bearer ${token}`
  }

  return baseFetch<T>(url, { ...fetchOptions, headers })
}