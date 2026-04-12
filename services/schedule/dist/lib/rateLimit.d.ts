import type Redis from 'ioredis';
/**
 * Returns the Redis key for a platform connection's daily rate limit counter.
 * Format: rate_limit:{platform_connection_id}:{YYYY-MM-DD}
 */
export declare function getRateLimitKey(platformConnectionId: string, date?: Date): string;
/**
 * Returns the Unix timestamp (seconds) for the next UTC midnight after the given date.
 */
export declare function getUtcMidnightTimestamp(date?: Date): number;
/**
 * Returns the ISO string for the next UTC midnight after the given date.
 */
export declare function getUtcMidnightIso(date?: Date): string;
export interface RateLimitResult {
    allowed: boolean;
    count: number;
    limit: number;
    resetsAt: string;
}
/**
 * Atomically increments the rate limit counter for a platform connection.
 * Uses INCR + EXPIREAT so the key expires at UTC midnight.
 *
 * Returns whether the publish attempt is allowed and the current count.
 * If the count after increment exceeds the limit, the increment is NOT applied
 * (we check before incrementing to avoid consuming a slot unnecessarily).
 */
export declare function checkAndIncrementRateLimit(redis: Redis, platformConnectionId: string, now?: Date): Promise<RateLimitResult>;
/**
 * Returns the current rate limit count for a platform connection without modifying it.
 */
export declare function getRateLimitCount(redis: Redis, platformConnectionId: string, now?: Date): Promise<number>;
