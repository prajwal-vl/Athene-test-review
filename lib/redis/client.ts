import { Redis } from "@upstash/redis";

// Graceful fallback: if Redis env vars aren't set, use a no-op stub
// so the app doesn't crash during local dev without Upstash.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis =
  url && token
    ? new Redis({ url, token })
    : ({
        get: async () => null,
        set: async () => "OK",
        incr: async () => null,
        decr: async () => null,
        expire: async () => true,
        del: async () => 0,
      } as unknown as Redis);

/**
 * Helper to cache a value in Redis.
 *
 * @param key - The unique Redis key
 * @param ttlSeconds - Time-to-live in seconds
 * @param fn - Async function to compute the value if it's missing in cache
 * @returns The cached or freshly computed value
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  try {
    const cachedValue = await redis.get<T>(key);
    if (cachedValue !== null) {
      return cachedValue;
    }
  } catch (error) {
    console.error(`[Redis] Error fetching key ${key}:`, error);
    // Proceed to fn() fallback if Redis fetch fails so the app doesn't crash
  }

  const result = await fn();

  try {
    await redis.set(key, result, { ex: ttlSeconds });
  } catch (error) {
    console.error(`[Redis] Error setting key ${key}:`, error);
  }

  return result;
}

/**
 * Increment a numerical counter by 1. If the counter did not exist,
 * it will be set to 1 and receive the specified expiration.
 *
 * @param key - The strictly tracked key name
 * @param ttlSeconds - Time-to-live for the newly created counter
 * @returns The new count, or null if Redis fails (fail-closed: aborts dispatch)
 */
export async function incrWithExpire(
  key: string,
  ttlSeconds: number
): Promise<number | null> {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, ttlSeconds);
    }
    return count;
  } catch (error) {
    console.error(`[Redis] Error incrementing key ${key}:`, error);
    // Fail-Closed: Return null so dispatch aborts instead of flooding APIs
    return null;
  }
}
