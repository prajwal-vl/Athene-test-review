export async function microsoftGraphFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Microsoft Graph ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
