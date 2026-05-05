import { snowflakeFetch } from './client'
import { getConnection } from '@/lib/nango/client'

export interface TableSchema {
  database: string
  schema: string
  name: string
  columns: Array<{ name: string; type: string }>
}

export async function discoverSchema(connectionId: string, orgId: string): Promise<TableSchema[]> {
  const connection = await getConnection(connectionId, 'snowflake')
  const allowlist = connection.metadata?.allowlist as string[] | undefined

  if (!allowlist || allowlist.length === 0) {
    return []
  }

  const schemas: TableSchema[] = []

  // Snowflake SQL API returns data in row-column format.
  // We need to parse it to get our results.
  
  const identifierRegex = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/

  for (const tableFullName of allowlist) {
    if (!identifierRegex.test(tableFullName)) {
      console.warn(`Invalid Snowflake identifier in allowlist: ${tableFullName}. Skipping.`)
      continue
    }
    // Expected format: DATABASE.SCHEMA.TABLE or just TABLE if defaults set
    const parts = tableFullName.split('.')
    let database = ''
    let schema = ''
    let tableName = ''

    if (parts.length === 3) {
      [database, schema, tableName] = parts
    } else if (parts.length === 2) {
      [schema, tableName] = parts
    } else {
      tableName = parts[0]
    }

    try {
      // Get table info
      const describeRes = await snowflakeFetch(connectionId, orgId, `DESCRIBE TABLE ${tableFullName}`)
      
      const columns = parseSnowflakeRows(describeRes).map((row: any) => ({
        name: row.name,
        type: row.type
      }))

      schemas.push({
        database,
        schema,
        name: tableName,
        columns
      })
    } catch (error) {
      console.error(`Error describing table ${tableFullName}:`, error)
    }
  }

  return schemas
}

/**
 * Parses Snowflake SQL API response into a more usable array of objects.
 */
export function parseSnowflakeRows(response: any): any[] {
  if (!response.resultSetMetaData || !response.data) {
    return []
  }

  const columns = response.resultSetMetaData.rowType.map((col: any) => col.name.toLowerCase())
  return response.data.map((row: any[]) => {
    const obj: any = {}
    columns.forEach((colName: string, index: number) => {
      obj[colName] = row[index]
    })
    return obj
  })
}
