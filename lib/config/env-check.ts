// ============================================================
// lib/config/env-check.ts — Startup environment variable validation
//
// Call checkEnv() at module init time (e.g. in lib/supabase/server.ts)
// to catch misconfigured deployments before they surface as cryptic
// runtime errors deep inside request handlers.
//
// Missing required vars  → throws (hard fail, deployment is broken)
// Missing optional groups → logs a warning (feature degraded, not dead)
// ============================================================

const REQUIRED: Record<string, string[]> = {
  clerk: ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'],
  supabase: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
  encryption: ['ENCRYPTION_SECRET', 'KMS_SECRET'],
}

/** At least one of these must be set for LLM inference to work. */
const LLM_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY']

const OPTIONAL_GROUPS: Record<string, string[]> = {
  redis: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  qstash: [
    'QSTASH_TOKEN',
    'QSTASH_CURRENT_SIGNING_KEY',
    'QSTASH_NEXT_SIGNING_KEY',
  ],
  nango: ['NANGO_SECRET_KEY'],
}

/**
 * Validates environment variables at startup.
 *
 * - Throws an aggregated error listing every missing required variable.
 * - Logs a warning for each optional feature group that is fully absent.
 * - Validates that at least one LLM key is present.
 *
 * Call once at module initialisation — not per-request.
 */
export function checkEnv(): void {
  const missing: string[] = []

  // ── Required groups ────────────────────────────────────────────
  for (const [group, vars] of Object.entries(REQUIRED)) {
    for (const varName of vars) {
      if (!process.env[varName]) {
        missing.push(`${varName} (${group})`)
      }
    }
  }

  // ── LLM: at least one key required ────────────────────────────
  const hasLlmKey = LLM_KEYS.some((k) => Boolean(process.env[k]))
  if (!hasLlmKey) {
    missing.push(`at least one of: ${LLM_KEYS.join(', ')} (llm)`)
  }

  if (missing.length > 0) {
    throw new Error(
      `[env-check] Missing required environment variables:\n  ${missing.join('\n  ')}`
    )
  }

  // ── Optional groups — warn only ────────────────────────────────
  for (const [group, vars] of Object.entries(OPTIONAL_GROUPS)) {
    const anySet = vars.some((v) => Boolean(process.env[v]))
    if (!anySet) {
      console.warn(
        `[env-check] Optional feature group "${group}" is not configured (${vars.join(', ')}). ` +
        `Related functionality will be unavailable.`
      )
    }
  }
}
