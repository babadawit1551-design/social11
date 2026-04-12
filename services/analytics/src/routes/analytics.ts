import type { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
import { requireAuth } from '../middleware/auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function analyticsRoutes(app: FastifyInstance | any, prisma: PrismaClient) {
  // GET /analytics/posts/:id — aggregated metrics across all platforms
  app.get(
    '/analytics/posts/:id',
    { preHandler: requireAuth() },
    async (
      request: { params: { id: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { id: postId } = request.params;

      // Verify post exists
      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      // Fetch all platform_posts with their analytics_cache for this post
      const platformPosts = await prisma.platformPost.findMany({
        where: { postId },
        include: { analyticsCache: true },
      });

      // Aggregate metrics across all platforms
      let impressions = BigInt(0);
      let likes = BigInt(0);
      let shares = BigInt(0);
      let comments = BigInt(0);
      let clicks = BigInt(0);
      let lastRefreshedAt: Date | null = null;

      for (const pp of platformPosts) {
        if (pp.analyticsCache) {
          impressions += pp.analyticsCache.impressions;
          likes += pp.analyticsCache.likes;
          shares += pp.analyticsCache.shares;
          comments += pp.analyticsCache.comments;
          clicks += pp.analyticsCache.clicks;

          if (
            lastRefreshedAt === null ||
            pp.analyticsCache.lastRefreshedAt > lastRefreshedAt
          ) {
            lastRefreshedAt = pp.analyticsCache.lastRefreshedAt;
          }
        }
      }

      return reply.status(200).send({
        postId,
        impressions: impressions.toString(),
        likes: likes.toString(),
        shares: shares.toString(),
        comments: comments.toString(),
        clicks: clicks.toString(),
        lastRefreshedAt,
        platformCount: platformPosts.length,
      });
    },
  );

  // GET /analytics/posts/:id/platforms — per-platform breakdown
  app.get(
    '/analytics/posts/:id/platforms',
    { preHandler: requireAuth() },
    async (
      request: { params: { id: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { id: postId } = request.params;

      // Verify post exists
      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      // Fetch all platform_posts with their analytics_cache for this post
      const platformPosts = await prisma.platformPost.findMany({
        where: { postId },
        include: { analyticsCache: true },
      });

      const result = platformPosts.map((pp) => ({
        platformPostId: pp.id,
        platform: pp.platform,
        status: pp.status,
        publishedAt: pp.publishedAt,
        metrics: pp.analyticsCache
          ? {
              impressions: pp.analyticsCache.impressions.toString(),
              likes: pp.analyticsCache.likes.toString(),
              shares: pp.analyticsCache.shares.toString(),
              comments: pp.analyticsCache.comments.toString(),
              clicks: pp.analyticsCache.clicks.toString(),
              lastRefreshedAt: pp.analyticsCache.lastRefreshedAt,
            }
          : null,
      }));

      return reply.status(200).send(result);
    },
  );
}
