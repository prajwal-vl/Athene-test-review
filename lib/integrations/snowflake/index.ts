import { fetchSnowflakeSamples } from './sample-fetcher'
import { snowflakeSearch } from './searcher'
import { registerProvider, registerSearcher } from '../registry'
import { FetchedChunk } from '../base'

export async function snowflakeFetcher(connectionId: string, orgId: string): Promise<FetchedChunk[]> {
  return await fetchSnowflakeSamples(connectionId, orgId)
}

// Register
registerProvider('snowflake', snowflakeFetcher)
registerSearcher('snowflake', snowflakeSearch)
