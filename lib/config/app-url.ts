export function getAppBaseUrl(): string {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!rawUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is required for worker callbacks');
  }

  try {
    const parsed = new URL(rawUrl);
    if (!parsed.protocol.startsWith('http')) {
      throw new Error('NEXT_PUBLIC_APP_URL must use http/https');
    }
    return parsed.origin;
  } catch (error) {
    throw new Error(
      `Invalid NEXT_PUBLIC_APP_URL (${rawUrl}): ${error instanceof Error ? error.message : 'parse error'}`,
    );
  }
}
