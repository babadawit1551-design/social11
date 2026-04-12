import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import IORedisMock from 'ioredis-mock';
import {
  getRateLimitKey,
  getUtcMidnightTimestamp,
  getUtcMidnightIso,
  checkAndIncrementRateLimit,
  getRateLimitCount,
} from './rateLimit';
import { RATE_LIMIT_PER_DAY } from 'smas-shared';

// Helper to create a fresh Redis mock instance
function createRedis() {
  return new IORedisMock();
}

// ─── Unit tests ────────────────────────────────────────────────────────────────

describe('getRateLimitKey', () => {
  it('formats key correctly for a known date', () => {
    const date = new Date('2024-03-15T10:30:00Z');
    expect(getRateLimitKey('conn-123', date)).toBe('rate_limit:conn-123:2024-03-15');
  });

  it('pads month and day with leading zeros', () => {
    const date = new Date('2024-01-05T00:00:00Z');
    expect(getRateLimitKey('abc', date)).toBe('rate_limit:abc:2024-01-05');
  });
});

describe('getUtcMidnightTimestamp', () => {
  it('returns timestamp for next UTC midnight', () => {
    const date = new Date('2024-03-15T10:30:00Z');
    const expected = new Date('2024-03-16T00:00:00Z').getTime() / 1000;
    expect(getUtcMidnightTimestamp(date)).toBe(expected);
  });
});

describe('getUtcMidnightIso', () => {
  it('returns ISO string for next UTC midnight', () => {
    const date = new Date('2024-03-15T23:59:59Z');
    expect(getUtcMidnightIso(date)).toBe('2024-03-16T00:00:00.000Z');
  });
});

// Use a far-future date so expireat TTL is never in the past for ioredis-mock
const FUTURE_DAY1 = new Date('2099-06-01T12:00:00Z');
const FUTURE_DAY2 = new Date('2099-06-02T00:00:01Z');

describe('checkAndIncrementRateLimit', () => {
  it('allows first publish attempt', async () => {
    const redis = createRedis();
    const result = await checkAndIncrementRateLimit(redis, 'conn-1', FUTURE_DAY1);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.limit).toBe(RATE_LIMIT_PER_DAY);
  });

  it('allows up to the limit', async () => {
    const redis = createRedis();
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
      const r = await checkAndIncrementRateLimit(redis, 'conn-2', FUTURE_DAY1);
      expect(r.allowed).toBe(true);
    }
  });

  it('rejects the (limit+1)th attempt', async () => {
    const redis = createRedis();
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
      await checkAndIncrementRateLimit(redis, 'conn-3', FUTURE_DAY1);
    }
    const result = await checkAndIncrementRateLimit(redis, 'conn-3', FUTURE_DAY1);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(RATE_LIMIT_PER_DAY);
  });

  it('does not consume a slot when limit is exceeded', async () => {
    const redis = createRedis();
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
      await checkAndIncrementRateLimit(redis, 'conn-4', FUTURE_DAY1);
    }
    // Attempt 3 more times over limit
    await checkAndIncrementRateLimit(redis, 'conn-4', FUTURE_DAY1);
    await checkAndIncrementRateLimit(redis, 'conn-4', FUTURE_DAY1);
    await checkAndIncrementRateLimit(redis, 'conn-4', FUTURE_DAY1);
    // Count should still be exactly at the limit
    const count = await getRateLimitCount(redis, 'conn-4', FUTURE_DAY1);
    expect(count).toBe(RATE_LIMIT_PER_DAY);
  });

  it('resets on a new UTC day (different date key)', async () => {
    const redis = createRedis();
    // Fill up day 1
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
      await checkAndIncrementRateLimit(redis, 'conn-5', FUTURE_DAY1);
    }
    const overLimit = await checkAndIncrementRateLimit(redis, 'conn-5', FUTURE_DAY1);
    expect(overLimit.allowed).toBe(false);

    // Day 2 should start fresh (different key)
    const day2Result = await checkAndIncrementRateLimit(redis, 'conn-5', FUTURE_DAY2);
    expect(day2Result.allowed).toBe(true);
    expect(day2Result.count).toBe(1);
  });

  it('includes resetsAt in the result', async () => {
    const redis = createRedis();
    const now = new Date('2099-06-01T10:00:00Z');
    const result = await checkAndIncrementRateLimit(redis, 'conn-6', now);
    expect(result.resetsAt).toBe('2099-06-02T00:00:00.000Z');
  });
});

describe('getRateLimitCount', () => {
  it('returns 0 when no publishes have occurred', async () => {
    const redis = createRedis();
    const count = await getRateLimitCount(redis, 'conn-new', FUTURE_DAY1);
    expect(count).toBe(0);
  });

  it('returns correct count after increments', async () => {
    const redis = createRedis();
    await checkAndIncrementRateLimit(redis, 'conn-7', FUTURE_DAY1);
    await checkAndIncrementRateLimit(redis, 'conn-7', FUTURE_DAY1);
    await checkAndIncrementRateLimit(redis, 'conn-7', FUTURE_DAY1);
    const count = await getRateLimitCount(redis, 'conn-7', FUTURE_DAY1);
    expect(count).toBe(3);
  });
});

// ─── Property-based tests ──────────────────────────────────────────────────────

describe('Property 13: Rate limit enforcement', () => {
  // Feature: social-media-automation-system, Property 13: For any Platform_Connection that has already published 50 posts in the current UTC calendar day, any further publish attempt for that connection should be rejected with a descriptive error.
  it('rejects any publish attempt after 50 posts on the same day', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 20 }), // extra attempts over limit
        async (connectionId, extraAttempts) => {
          const redis = createRedis();
          // Use a far-future date so expireat TTL is never in the past
          const now = new Date('2099-06-15T12:00:00Z');

          // Fill up to the limit
          for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
            const r = await checkAndIncrementRateLimit(redis, connectionId, now);
            expect(r.allowed).toBe(true);
          }

          // All extra attempts must be rejected
          for (let i = 0; i < extraAttempts; i++) {
            const r = await checkAndIncrementRateLimit(redis, connectionId, now);
            expect(r.allowed).toBe(false);
            expect(r.count).toBe(RATE_LIMIT_PER_DAY);
            expect(r.limit).toBe(RATE_LIMIT_PER_DAY);
            expect(typeof r.resetsAt).toBe('string');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 14: Rate limit reset at UTC midnight', () => {
  // Feature: social-media-automation-system, Property 14: For any Platform_Connection, after a UTC midnight boundary passes, the daily post count should reset to zero, allowing new publish attempts.
  it('allows new publishes after UTC midnight boundary', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 0, max: 50 }), // posts published on day 1
        async (connectionId, postsOnDay1) => {
          const redis = createRedis();
          // Use far-future dates so expireat TTL is never in the past
          const day1 = new Date('2099-07-10T22:00:00Z');
          const day2 = new Date('2099-07-11T00:00:01Z');

          for (let i = 0; i < postsOnDay1; i++) {
            await checkAndIncrementRateLimit(redis, connectionId, day1);
          }

          // After midnight, count should reset — first attempt on day 2 must be allowed
          const result = await checkAndIncrementRateLimit(redis, connectionId, day2);
          expect(result.allowed).toBe(true);
          expect(result.count).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('resets count to zero on new UTC day regardless of previous day count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (connectionId) => {
          const redis = createRedis();
          const day1 = new Date('2099-08-20T18:00:00Z');
          const day2 = new Date('2099-08-21T00:00:00Z');

          // Fill day 1 completely
          for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
            await checkAndIncrementRateLimit(redis, connectionId, day1);
          }

          // Day 2 count should start at 0
          const countDay2 = await getRateLimitCount(redis, connectionId, day2);
          expect(countDay2).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
