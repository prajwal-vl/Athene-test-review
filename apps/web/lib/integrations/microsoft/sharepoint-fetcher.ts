import { microsoftGraphFetch } from "@/lib/integrations/microsoft/graph-client";

export async function fetchSharePointDocument(accessToken: string, sourceId: string) {
  const metadata = await microsoftGraphFetch<any>(accessToken, `/drive/items/${encodeURIComponent(sourceId)}`);
  const response = await fetch(`https://graph.microsoft.com/v1.0/drive/items/${encodeURIComponent(sourceId)}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`SharePoint content fetch failed: ${response.status}`);
  return {
    content: await response.text(),
    title: metadata.name || sourceId,
    sourceUrl: metadata.webUrl || "",
    author: metadata.createdBy?.user?.displayName || null,
    lastModified: metadata.lastModifiedDateTime || null,
  };
}
