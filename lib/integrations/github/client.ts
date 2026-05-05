import { getConnectionToken } from '@/lib/nango/client';

export async function githubFetch(connectionId: string, orgId: string, query: string, variables = {}) {
  const token = await getConnectionToken(connectionId, 'github', orgId);
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub GraphQL Error: ${res.status} - ${errorText}`);
  }

  return res.json();
}

export async function githubRestFetch(connectionId: string, orgId: string, path: string) {
  const token = await getConnectionToken(connectionId, 'github', orgId);
  const res = await fetch(`https://api.github.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub REST Error: ${res.status} - ${errorText}`);
  }

  return res.json();
}
