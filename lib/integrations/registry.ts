import { FetchedChunk } from './base'

export type FetcherFn = (connectionId: string, orgId: string) => Promise<FetchedChunk[]>
export type SearcherFn = (connectionId: string, orgId: string, query: string) => Promise<FetchedChunk[]>

const providers: Record<string, FetcherFn> = {}
const searchers: Record<string, SearcherFn> = {}

export function registerProvider(id: string, fetcher: FetcherFn) {
  providers[id] = fetcher
}

export function registerSearcher(id: string, searcher: SearcherFn) {
  searchers[id] = searcher
}

export function getProvider(id: string): FetcherFn | undefined {
  return providers[id]
}

export function getSearcher(id: string): SearcherFn | undefined {
  return searchers[id]
}

export function listProviders(): string[] {
  return Object.keys(providers)
}

export function listSearchers(): string[] {
  return Object.keys(searchers)
}
