import { salesforceFetch } from './client'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { FetchedChunk } from '@/lib/integrations/base'

async function getOrgConnection(orgId: string, provider: string) {
  const { data, error } = await supabaseAdmin
    .from('nango_connections')
    .select('connection_id, metadata')
    .eq('org_id', orgId)
    .eq('provider_config_key', provider)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return {
    connectionId: data.connection_id as string,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
  }
}

export async function salesforceSearch(
  connectionId: string,
  orgId: string,
  query: string,
  args?: any
): Promise<FetchedChunk[]> {
  const limit = args?.limit ?? 5;
  const conn = await getOrgConnection(orgId, 'salesforce')
  if (!conn) {
    console.warn('[live-search:salesforce] no active connection for org', orgId)
    return []
  }

  // Escape SOSL special chars
  const safeQuery = query.replace(/[?&|!{}[\]()^~*:\\"'+-]/g, '\\$&')
  const instanceUrl = (conn.metadata?.instance_url as string) || undefined

  // SOSL: search Accounts, Opportunities, Cases
  const soslPath = `/search/?q=FIND+{${encodeURIComponent(safeQuery)}}+IN+ALL+FIELDS+RETURNING+` +
    `Account(Id,Name+LIMIT+${limit}),` +
    `Opportunity(Id,Name+LIMIT+${limit}),` +
    `Case(Id,Subject+LIMIT+${limit})`

  try {
    const data = await salesforceFetch(conn.connectionId, soslPath, orgId, instanceUrl) as {
      searchRecords: Array<{
        attributes: { type: string }
        Id: string
        Name?: string
        Subject?: string
      }>
    }

    const baseUrl = instanceUrl ?? 'https://login.salesforce.com'
    return (data.searchRecords ?? []).slice(0, limit).map((rec) => {
      const typeLower = rec.attributes.type.toLowerCase();
      const resourceType = typeLower === 'account' ? 'accounts' : 
                           typeLower === 'opportunity' ? 'opportunities' : 
                           typeLower === 'case' ? 'cases' : 'unknown';
      return {
        chunk_id: `sf-${typeLower}-${rec.Id}`,
        title:       rec.Name ?? rec.Subject ?? rec.Id,
        content:     rec.Name ?? rec.Subject ?? rec.Id, // fallback for content
        source_url:         `${baseUrl}/lightning/r/${rec.attributes.type}/${rec.Id}/view`,
        metadata: {
          provider: 'salesforce',
          resource_type: resourceType,
          id: rec.Id
        }
      };
    })
  } catch (err) {
    console.error('[live-search:salesforce] SOSL query failed:', err instanceof Error ? err.message : String(err))
    return []
  }
}
