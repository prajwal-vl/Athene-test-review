import { FetchedChunk } from '../base';
import { githubRestFetch } from './client';

export interface GitHubSearchConfig {
  owner?: string;
  repo?: string;
}

export async function githubSearcher(
  connectionId: string,
  orgId: string,
  query: string,
  config?: GitHubSearchConfig
): Promise<FetchedChunk[]> {
  const finalQuery = config?.owner && config?.repo 
    ? `${query} repo:${config.owner}/${config.repo}` 
    : query;
  
  const encodedQuery = encodeURIComponent(finalQuery);
  const data: any = await githubRestFetch(connectionId, orgId, `/search/issues?q=${encodedQuery}`);
  
  if (!data?.items) return [];

  return data.items.map((item: any) => ({
    chunk_id: item.id.toString(),
    title: item.title,
    content: item.body || '',
    source_url: item.html_url,
    metadata: {
      provider: 'github',
      resource_type: 'issue',
      state: item.state,
      created_at: item.created_at,
      author: item.user?.login
    }
  }));
}
