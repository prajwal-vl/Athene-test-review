import { ProviderKey } from './providers';
import { FetchedChunk } from './base';
import { hubspotSearch } from './hubspot/searcher';
import { salesforceSearch } from './salesforce/searcher';

export * from './base';
export * from './providers';
export * from './indexing';

// Expose map for search requests
export function getSearcher(provider: ProviderKey | string): ((connectionId: string, orgId: string, query: string, args?: any) => Promise<FetchedChunk[]>) | null {
  if (provider === 'hubspot') return hubspotSearch;
  if (provider === 'salesforce') return salesforceSearch;
  return null;
}

// Expose map for simple batched doc fetches
export function getProvider(provider: ProviderKey | string): ((connectionId: string, orgId: string, ...args: any[]) => Promise<FetchedChunk[]>) | null {
  return null;
}
