import { getConnectionToken } from '@/lib/nango/client';

export async function linearFetch(connectionId: string, orgId: string, query: string, variables = {}) {
  const token = await getConnectionToken(connectionId, 'linear', orgId);
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Linear GraphQL Error: ${res.status} - ${errorText}`);
  }

  return res.json();
}
