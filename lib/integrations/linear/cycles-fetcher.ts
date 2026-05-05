import { linearFetch } from './client';
import { FetchedChunk } from '../base';

const CYCLES_QUERY = `
  query GetCycles($cursor: String) {
    cycles(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        description
        startsAt
        endsAt
        issues(first: 100) {
          nodes {
            title
            state {
              name
            }
          }
        }
      }
    }
  }
`;

export async function linearCyclesFetcher(connectionId: string, orgId: string): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const data: any = await linearFetch(connectionId, orgId, CYCLES_QUERY, { cursor });
    
    const cyclesResult = data.data?.cycles;
    if (!cyclesResult) break;

    for (const cycle of cyclesResult.nodes) {
      const issuesSummary = cycle.issues?.nodes?.map((i: any) => `- [${i.state?.name || 'Unknown'}] ${i.title}`).join('\n') || '';
      const fullContent = `Linear Cycle: ${cycle.name}\nDates: ${cycle.startsAt} to ${cycle.endsAt}\n\n${cycle.description || ''}\n\nIssues in Cycle:\n${issuesSummary}`;
      
      const chunk: FetchedChunk = {
        chunk_id: cycle.id,
        title: cycle.name,
        content: fullContent,
        source_url: '',
        metadata: {
          provider: 'linear',
          resource_type: 'cycle',
        }
      };
      
      chunks.push(chunk);
    }

    hasNextPage = cyclesResult.pageInfo.hasNextPage;
    cursor = cyclesResult.pageInfo.endCursor;
  }

  return chunks;
}
