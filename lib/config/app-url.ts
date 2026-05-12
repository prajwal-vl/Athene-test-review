export function getAppBaseUrl(): string {
  // Explicit override wins (local dev + production custom domain)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      const parsed = new URL(process.env.NEXT_PUBLIC_APP_URL);
      if (!parsed.protocol.startsWith('http')) throw new Error('must use http/https');
      return parsed.origin;
    } catch (error) {
      throw new Error(
        `Invalid NEXT_PUBLIC_APP_URL (${process.env.NEXT_PUBLIC_APP_URL}): ${error instanceof Error ? error.message : 'parse error'}`,
      );
    }
  }

  // Vercel auto-injects VERCEL_URL (without protocol) on every deployment
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Local dev fallback
  return 'http://localhost:3000';
}
