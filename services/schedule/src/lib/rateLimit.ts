import type Redis from 'ioredis';
import { RATE_LIMIT_PER_DAY } from 'smas-shared';

/**
 * Returns the Redis key for a platform connection's daily rate limit counter.
 * Format: rate_limit:{platform_connection_id}:{YYYY-MM-DD}
 */
export function getRateLimitKey(platformConnectionId: string, date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `rate_limit:${platformConnectionId}:${yyyy}-${mm}-${dd}`;
}

/**
 * Returns the Unix timestamp (seconds) for the next UTC midnight after the given date.
 */
export function getUtcMidnightTimestamp(date: Date = new Date()): number {
  const midnight = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
  return Math.floor(midnight.getTime() / 1000);
}

/**
 * Returns the ISO string for the next UTC midnight after the given date.
 */
export function getUtcMidnightIso(date: Date = new Date()): string {
  const midnight = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
  return midnight.toISOString();
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetsAt: string; // ISO UTC midnight
}

/**
 * Atomically increments the rate limit counter for a platform connection.
 * Uses INCR + EXPIREAT so the key expires at UTC midnight.
 *
 * Returns whether the publish attempt is allowed and the current count.
 * If the count after increment exceeds the limit, the increment is NOT applied
 * (we check before incrementing to avoid consuming a slot unnecessarily).
 */
export async function checkAndIncrementRateLimit(
  redis: Redis,
  platformConnectionId: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const key = getRateLimitKey(platformConnectionId, now);
  const resetsAt = getUtcMidnightIso(now);
  const expireAt = getUtcMidnightTimestamp(now);

  // Atomically increment and set expiry
  const count = await redis.incr(key);

  // Set expiry only when the key is first created (count === 1) or ensure it's set
  if (count === 1) {
    await redis.expireat(key, expireAt);
  }

  const allowed = count <= RATE_LIMIT_PER_DAY;

  // If over limit, decrement back so we don't consume a slot
  if (!allowed) {
    await redis.decr(key);
  }

  return {
    allowed,
    count: allowed ? count : RATE_LIMIT_PER_DAY,
    limit: RATE_LIMIT_PER_DAY,
    resetsAt,
  };
}

/**
 * Returns the current rate limit count for a platform connection without modifying it.
 */
export async function getRateLimitCount(
  redis: Redis,
  platformConnectionId: string,
  now: Date = new Date(),
): Promise<number> {
  const key = getRateLimitKey(platformConnectionId, now);
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}
