const requiredServerEnv = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NANGO_SECRET_KEY",
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "OPENAI_API_KEY",
  "ENCRYPTION_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;

export function requireEnv(name: (typeof requiredServerEnv)[number] | string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function assertServerEnv() {
  for (const key of requiredServerEnv) requireEnv(key);
}
