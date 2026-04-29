import { getCloudId, atlassianFetch } from "./client";
import { stripHtml } from "./confluence-html";
import type { FetchedChunk } from "../base";

/**
 * Fetches Confluence pages for the given connection and org.
 * Paginates through all results using cursor-based pagination.
 */
export async function fetchConfluencePages(
  connectionId: string,
  orgId: string,
  options?: { since?: string; limit?: number }
): Promise<FetchedChunk[]> {
  const cloudId = await getCloudId(connectionId, orgId, "confluence");
  const chunks: FetchedChunk[] = [];
  const limit = options?.limit ?? 50;
  let cursor: string | null = null;

  do {
    const cursorParam: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const data = await atlassianFetch<{
      results: any[];
      _links?: { next?: string };
    }>(
      connectionId,
      cloudId,
      `/wiki/api/v2/pages?limit=${limit}&body-format=storage${cursorParam}`,
      orgId,
      "confluence"
    );

    if (!data.results?.length) break;

    for (const page of data.results) {
      const bodyHtml = page.body?.storage?.value ?? "";
      const content = stripHtml(bodyHtml);
      chunks.push({
        chunk_id: `confluence_${page.id}`,
        title: `Confluence: ${page.title}`,
        content: content || page.title,
        source_url: page._links?.webui
          ? `https://api.atlassian.com/ex/confluence/${cloudId}${page._links.webui}`
          : `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/spaces/${page.spaceId}/pages/${page.id}`,
        metadata: {
          provider: "confluence",
          resource_type: "page",
          space_id: page.spaceId,
          last_modified: page.version?.createdAt,
        },
      });
    }

    const nextLink = data._links?.next;
    cursor = nextLink
      ? new URL(nextLink, "https://api.atlassian.com").searchParams.get(
          "cursor"
        )
      : null;
  } while (cursor);

  return chunks;
}
