import { getCloudId, atlassianFetch } from "./client";
import { extractTextFromADF } from "./adf-to-text";
import type { FetchedChunk } from "../base";

/**
 * Fetches Jira issues for the given connection and org.
 * Paginates through all results using startAt/maxResults.
 */
export async function fetchJiraIssues(
  connectionId: string,
  orgId: string,
  options?: { since?: string; limit?: number }
): Promise<FetchedChunk[]> {
  const cloudId = await getCloudId(connectionId, orgId, "jira");
  const chunks: FetchedChunk[] = [];
  const maxResults = options?.limit ?? 50;
  let startAt = 0;
  let total = Infinity;

  const jql = options?.since
    ? `updated >= "${options.since}" ORDER BY updated DESC`
    : "ORDER BY updated DESC";

  while (startAt < total) {
    const data = await atlassianFetch<{
      issues: any[];
      total: number;
      startAt: number;
    }>(
      connectionId,
      cloudId,
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,description,status,assignee,reporter,created,updated`,
      orgId,
      "jira"
    );

    total = data.total;
    if (!data.issues?.length) break;

    for (const issue of data.issues) {
      const description = extractTextFromADF(issue.fields.description);
      chunks.push({
        chunk_id: `jira_${issue.id}`,
        title: `[${issue.key}] ${issue.fields.summary}`,
        content: `Summary: ${issue.fields.summary}\nStatus: ${issue.fields.status?.name}\nAssignee: ${issue.fields.assignee?.displayName ?? "Unassigned"}\n\n${description}`,
        source_url: `https://api.atlassian.com/ex/jira/${cloudId}/browse/${issue.key}`,
        metadata: {
          provider: "jira",
          resource_type: "issue",
          issue_key: issue.key,
          status: issue.fields.status?.name,
          last_modified: issue.fields.updated,
        },
      });
    }

    startAt += data.issues.length;
    if (startAt >= total) break;
  }

  return chunks;
}
