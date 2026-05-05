import { FetchedChunk } from '../base';
import { linearFetch } from './client';

export interface LinearSearchConfig {
  // Empty for now, signature parity 
}

export async function linearSearcher(
  connectionId: string, 
  orgId: string, 
  query: string,
  config?: LinearSearchConfig
): Promise<FetchedChunk[]> {
  // Use GraphQL to filter searchable issues
  const GQL = `
    query SearchIssues($query: String!) {
      issues(first: 20, filter: { searchableContent: { containsIgnoreCase: $query } }) {
        nodes {
          id
          title
          description
          url
          createdAt
        }
      }
    }
  `;

  const data: any = await linearFetch(connectionId, orgId, GQL, { query });
  
  const issues = data.data?.issues?.nodes;
  if (!issues) return [];

  return issues.map((issue: any) => ({
    chunk_id: issue.id,
    title: issue.title,
    content: issue.description || '',
    source_url: issue.url,
    metadata: {
      provider: 'linear',
      resource_type: 'issue',
      created_at: issue.createdAt,
    }
  }));
}
