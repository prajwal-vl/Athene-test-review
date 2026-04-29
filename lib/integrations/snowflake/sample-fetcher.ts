import { snowflakeFetch } from './client'
import { parseSnowflakeRows } from './schema-fetcher'
import { getConnection } from '@/lib/nango/client'
import { FetchedChunk } from '../base'

export async function fetchSnowflakeSamples(connectionId: string, orgId: string): Promise<FetchedChunk[]> {
  const connection = await getConnection(connectionId, 'snowflake')
  const allowlist = connection.metadata?.allowlist as string[] | undefined

  if (!allowlist || allowlist.length === 0) {
    return []
  }

  const chunks: FetchedChunk[] = []

  const identifierRegex = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/

  for (const tableFullName of allowlist) {
    if (!identifierRegex.test(tableFullName)) continue
    try {
      const response = await snowflakeFetch(connectionId, orgId, `SELECT * FROM ${tableFullName} LIMIT 100`)
      const rows = parseSnowflakeRows(response)
      
      if (rows.length === 0) continue

      const content = rows.map(row => {
        return Object.entries(row)
          .map(([col, val]) => `${col}: ${val}`)
          .join(', ')
      }).join('\n')

      const parts = tableFullName.split('.')
      const tableName = parts[parts.length - 1]

      chunks.push({
        chunk_id: `snowflake_sample_${tableFullName}`,
        title: `table: ${tableName}`,
        content,
        source_url: `snowflake://${tableFullName}`, 
        metadata: {
          provider: 'snowflake',
          resource_type: 'table_sample',
          table: tableFullName,
          database: parts.length === 3 ? parts[0] : undefined,
          schema: parts.length >= 2 ? parts[parts.length - 2] : undefined
        }
      })
    } catch (error) {
      console.error(`Error fetching samples for table ${tableFullName}:`, error)
    }
  }

  return chunks
}
