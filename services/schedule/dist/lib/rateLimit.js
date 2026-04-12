"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRateLimitKey = getRateLimitKey;
exports.getUtcMidnightTimestamp = getUtcMidnightTimestamp;
exports.getUtcMidnightIso = getUtcMidnightIso;
exports.checkAndIncrementRateLimit = checkAndIncrementRateLimit;
exports.getRateLimitCount = getRateLimitCount;
const smas_shared_1 = require("smas-shared");
/**
 * Returns the Redis key for a platform connection's daily rate limit counter.
 * Format: rate_limit:{platform_connection_id}:{YYYY-MM-DD}
 */
function getRateLimitKey(platformConnectionId, date = new Date()) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `rate_limit:${platformConnectionId}:${yyyy}-${mm}-${dd}`;
}
/**
 * Returns the Unix timestamp (seconds) for the next UTC midnight after the given date.
 */
function getUtcMidnightTimestamp(date = new Date()) {
    const midnight = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return Math.floor(midnight.getTime() / 1000);
}
/**
 * Returns the ISO string for the next UTC midnight after the given date.
 */
function getUtcMidnightIso(date = new Date()) {
    const midnight = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return midnight.toISOString();
}
/**
 * Atomically increments the rate limit counter for a platform connection.
 * Uses INCR + EXPIREAT so the key expires at UTC midnight.
 *
 * Returns whether the publish attempt is allowed and the current count.
 * If the count after increment exceeds the limit, the increment is NOT applied
 * (we check before incrementing to avoid consuming a slot unnecessarily).
 */
async function checkAndIncrementRateLimit(redis, platformConnectionId, now = new Date()) {
    const key = getRateLimitKey(platformConnectionId, now);
    const resetsAt = getUtcMidnightIso(now);
    const expireAt = getUtcMidnightTimestamp(now);
    // Atomically increment and set expiry
    const count = await redis.incr(key);
    // Set expiry only when the key is first created (count === 1) or ensure it's set
    if (count === 1) {
        await redis.expireat(key, expireAt);
    }
    const allowed = count <= smas_shared_1.RATE_LIMIT_PER_DAY;
    // If over limit, decrement back so we don't consume a slot
    if (!allowed) {
        await redis.decr(key);
    }
    return {
        allowed,
        count: allowed ? count : smas_shared_1.RATE_LIMIT_PER_DAY,
        limit: smas_shared_1.RATE_LIMIT_PER_DAY,
        resetsAt,
    };
}
/**
 * Returns the current rate limit count for a platform connection without modifying it.
 */
async function getRateLimitCount(redis, platformConnectionId, now = new Date()) {
    const key = getRateLimitKey(platformConnectionId, now);
    const val = await redis.get(key);
    return val ? parseInt(val, 10) : 0;
}
//# sourceMappingURL=rateLimit.js.map