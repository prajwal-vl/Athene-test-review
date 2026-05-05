import { linearFetch } from './client';
import { FetchedChunk } from '../base';

const PROJECTS_QUERY = `
  query GetProjects($cursor: String) {
    projects(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        description
        url
        createdAt
        projectUpdates(first: 10) {
          nodes {
            body
          }
        }
      }
    }
  }
`;

// Note: Milestones usually reside either globally or within project structure depending on schema version.
// Here we fetch project with recent updates as part of projects sync. You can incorporate milestones separately.

export async function linearProjectsFetcher(connectionId: string, orgId: string): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const data: any = await linearFetch(connectionId, orgId, PROJECTS_QUERY, { cursor });
    
    const projectsResult = data.data?.projects;
    if (!projectsResult) break;

    for (const project of projectsResult.nodes) {
      const updates = project.projectUpdates?.nodes?.map((u: any) => u.body).join('\n---\n') || '';
      const fullContent = `Linear Project: ${project.name}\n\n${project.description || ''}\n\nUpdates:\n${updates}`;
      
      const chunk: FetchedChunk = {
        chunk_id: project.id,
        title: project.name,
        content: fullContent,
        source_url: project.url,
        metadata: {
          provider: 'linear',
          resource_type: 'project',
          created_at: project.createdAt,
        }
      };
      
      chunks.push(chunk);
    }

    hasNextPage = projectsResult.pageInfo.hasNextPage;
    cursor = projectsResult.pageInfo.endCursor;
  }

  return chunks;
}
