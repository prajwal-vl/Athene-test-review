// ============================================================
// lib/integrations/retry.ts — Shared retry utility for fetchers
//
// Provides retryWithBackoff with special handling for HTTP 429
// rate-limit responses: uses a longer base delay (60 s) so the
// provider has time to reset its quota window.
// ============================================================

export interface RetryOptions {
  /** Number of retry attempts after the initial try (default 3). */
  retries?: number
  /**
   * Base delay in ms for non-429 errors; doubles each attempt (default 1000).
   * For 429 errors a fixed 60 000 ms base is used instead.
   */
  baseDelayMs?: number
  /** Optional callback invoked before each retry with the error and attempt number (1-based). */
  onRetry?: (err: unknown, attempt: number) => void
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>

  // Numeric HTTP status attached to the error object
  if (e.status === 429) return true

  // Error message containing "rate limit" (case-insensitive)
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  if (msg.includes('rate limit') || msg.includes('ratelimit') || msg.includes('too many requests')) {
    return true
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retries an async function with exponential backoff.
 *
 * Rate-limit errors (HTTP 429 or messages containing "rate limit") use a
 * 60-second base delay to respect provider quota windows.  All other errors
 * use the configurable `baseDelayMs` (default 1 000 ms), doubling each retry.
 *
 * If all retries are exhausted, the last error is re-thrown.
 *
 * @example
 * const data = await retryWithBackoff(() => hubspotFetch(...), { retries: 3 })
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 3, baseDelayMs = 1000, onRetry } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (attempt < retries) {
        onRetry?.(err, attempt + 1)

        const delayMs = isRateLimitError(err)
          ? 60_000 // back off for a full minute on rate-limit
          : baseDelayMs * 2 ** attempt

        await sleep(delayMs)
      }
    }
  }

  throw lastError
}
