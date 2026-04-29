// ============================================================
// HubSpot base client (ATH-67)
//
// Uses baseFetch<T>() for retry + rate-limit handling.
// Critical rule: token is fetched from Nango per-request,
// used once, then falls out of scope. Never stored, never logged.
// ============================================================

import { baseFetch, getProviderToken, type BaseFetchOptions } from '@/lib/integrations/base'

/**
 * Make an authenticated GET request to the HubSpot API.
 *
 * @param connectionId – Nango connection ID for this org's HubSpot link
 * @param path – API path (e.g. `/crm/v3/objects/contacts?limit=100`)
 * @param orgId – Clerk org ID for ownership verification
 * @param fetchOptions – Optional retry/method configuration passed to baseFetch
 */
export async function hubspotFetch<T = unknown>(
  connectionId: string,
  path: string,
  orgId: string,
  fetchOptions?: BaseFetchOptions
): Promise<T> {
  const url = `https://api.hubapi.com${path}`
  const token = await getProviderToken(connectionId, 'hubspot', orgId)

  const headers = {
    ...fetchOptions?.headers,
    Authorization: `Bearer ${token}`
  }

  return baseFetch<T>(url, { ...fetchOptions, headers })
}