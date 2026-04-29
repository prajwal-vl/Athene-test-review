import { githubRestFetch } from './client';
import { FetchedChunk } from '../base';

export async function githubWikiFetcher(connectionId: string, orgId: string, owner: string, repo: string): Promise<FetchedChunk[]> {
  const chunks: FetchedChunk[] = [];

  // Wiki repos in github typically end in .wiki.git, but files could also just be markdown files in the main repo tree.
  // The request said: `REST: GET /repos/{owner}/{repo}/git/trees for markdown files`
  
  try {
    // Get default branch commit
    const repoInfo = await githubRestFetch(connectionId, orgId, `/repos/${owner}/${repo}`);
    const defaultBranch = repoInfo.default_branch;
    
    // Fetch tree recursive
    const treeData = await githubRestFetch(connectionId, orgId, `/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
    
    if (treeData && treeData.tree) {
      const markdownFiles = treeData.tree.filter((t: any) => t.type === 'blob' && t.path.endsWith('.md'));
      
      for (const file of markdownFiles) {
        // Fetch content snippet (in a real world scenario, fetch the full blob or raw url, but we might just fetch the blob)
        // Note: For large repos we should fetch content in parallel.
        const blobData = await githubRestFetch(connectionId, orgId, `/repos/${owner}/${repo}/git/blobs/${file.sha}`);
        
        let contentStr = '';
        if (blobData.encoding === 'base64') {
          contentStr = Buffer.from(blobData.content, 'base64').toString('utf-8');
        } else {
          contentStr = blobData.content || '';
        }

        const chunk: FetchedChunk = {
          chunk_id: file.sha,
          title: file.path, // Use path as title for markdown files
          content: contentStr,
          source_url: `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${file.path}`,
          metadata: { 
            provider: 'github',
            resource_type: 'markdown_file',
            owner, 
            repo, 
            path: file.path 
          }
        };

        chunks.push(chunk);
      }
    }
  } catch (error) {
    console.error("Error fetching repository tree/wiki content", error);
  }

  return chunks;
}
