import cron from 'node-cron';
import { PrismaClient } from 'smas-shared';
import type { Platform } from 'smas-shared';

// Metrics shape returned by platform API fetchers
export interface PlatformMetrics {
  impressions: bigint;
  likes: bigint;
  shares: bigint;
  comments: bigint;
  clicks: bigint;
}

// Error thrown when the platform API returns HTTP 429 (rate limited)
export class PlatformRateLimitError extends Error {
  constructor(platform: string, platformPostId: string) {
    super(`Rate limit hit for platform=${platform} platformPostId=${platformPostId}`);
    this.name = 'PlatformRateLimitError';
  }
}

/**
 * Stub fetchers for each platform.
 * Replace the body of each function with a real API call when credentials are available.
 * Each function should throw PlatformRateLimitError on HTTP 429, or any Error on other failures.
 */
export const platformFetchers: Record<
  Platform,
  (platformPostId: string, accessToken: string) => Promise<PlatformMetrics>
> = {
  twitter: async (_platformPostId: string, _accessToken: string): Promise<PlatformMetrics> => {
    // TODO: replace with real Twitter API v2 call
    // e.g. GET /2/tweets/:id?tweet.fields=public_metrics
    return { impressions: 0n, likes: 0n, shares: 0n, comments: 0n, clicks: 0n };
  },

  linkedin: async (_platformPostId: string, _accessToken: string): Promise<PlatformMetrics> => {
    // TODO: replace with real LinkedIn Marketing API call
    // e.g. GET /v2/organizationalEntityShareStatistics?q=organizationalEntity&shares=urn:li:share:{id}
    return { impressions: 0n, likes: 0n, shares: 0n, comments: 0n, clicks: 0n };
  },

  facebook: async (_platformPostId: string, _accessToken: string): Promise<PlatformMetrics> => {
    // TODO: replace with real Meta Graph API call
    // e.g. GET /{post-id}/insights?metric=post_impressions,post_reactions_by_type_total
    return { impressions: 0n, likes: 0n, shares: 0n, comments: 0n, clicks: 0n };
  },

  instagram: async (_platformPostId: string, _accessToken: string): Promise<PlatformMetrics> => {
    // TODO: replace with real Meta Graph API call
    // e.g. GET /{media-id}/insights?metric=impressions,reach,likes,comments,shares
    return { impressions: 0n, likes: 0n, shares: 0n, comments: 0n, clicks: 0n };
  },
};

/**
 * Refreshes analytics_cache for all published platform_posts.
 * On any error (rate limit, network, etc.): logs and skips, retaining existing cache.
 * Returns the number of successfully refreshed records.
 */
export async function refreshAnalyticsCache(
  prisma: PrismaClient,
  fetchers: typeof platformFetchers = platformFetchers,
): Promise<number> {
  // Find all published platform_posts with their platform connection tokens
  const publishedPosts = await prisma.platformPost.findMany({
    where: { status: 'published', platformPostId: { not: null } },
    include: { platformConnection: { select: { accessToken: true } } },
  });

  if (publishedPosts.length === 0) return 0;

  let refreshed = 0;

  for (const pp of publishedPosts) {
    // platformPostId is guaranteed non-null by the query filter above
    const externalId = pp.platformPostId as string;
    const accessToken = pp.platformConnection.accessToken;

    try {
      const metrics = await fetchers[pp.platform](externalId, accessToken);

      await prisma.analyticsCache.upsert({
        where: { platformPostId: pp.id },
        create: {
          platformPostId: pp.id,
          impressions: metrics.impressions,
          likes: metrics.likes,
          shares: metrics.shares,
          comments: metrics.comments,
          clicks: metrics.clicks,
          lastRefreshedAt: new Date(),
        },
        update: {
          impressions: metrics.impressions,
          likes: metrics.likes,
          shares: metrics.shares,
          comments: metrics.comments,
          clicks: metrics.clicks,
          lastRefreshedAt: new Date(),
        },
      });

      refreshed++;
    } catch (err) {
      if (err instanceof PlatformRateLimitError) {
        console.warn(
          `[analyticsRefresher] Rate limit hit — retaining cached metrics for platform_post ${pp.id} ` +
            `(platform=${pp.platform}, externalId=${externalId})`,
        );
      } else {
        console.error(
          `[analyticsRefresher] Failed to refresh metrics for platform_post ${pp.id} ` +
            `(platform=${pp.platform}, externalId=${externalId}):`,
          err,
        );
      }
      // Retain existing cache — no user-facing error surfaced (Requirement 10.5)
    }
  }

  return refreshed;
}

/**
 * Starts the analytics cache refresh cron job.
 * Runs every 60 minutes as required by Requirement 10.2.
 */
export function startAnalyticsRefresher(prisma: PrismaClient): cron.ScheduledTask {
  // Run every 60 minutes
  const task = cron.schedule('0 * * * *', async () => {
    try {
      const count = await refreshAnalyticsCache(prisma);
      if (count > 0) {
        console.log(`[analyticsRefresher] Refreshed analytics cache for ${count} platform post(s)`);
      }
    } catch (err) {
      console.error('[analyticsRefresher] Unexpected error during analytics refresh:', err);
    }
  });

  return task;
}
