import type { FastifyInstance } from 'fastify';
import { PrismaClient, Platform } from 'smas-shared';
import { PLATFORM_CHAR_LIMITS } from 'smas-shared';
import { requireRole, requireAuth } from '../middleware/auth';

interface CreatePostBody {
  body: string;
  targetPlatforms: Platform[];
  mediaIds?: string[];
  scheduleAt?: string;
  timezone?: string;
  teamId?: string;
}

interface UpdatePostBody {
  body?: string;
  targetPlatforms?: Platform[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function postsRoutes(app: FastifyInstance | any, prisma: PrismaClient) {
  app.post(
    '/posts',
    { preHandler: requireRole('admin', 'editor') },
    async (request: { user: { id: string }; body: CreatePostBody }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) => {
      const { body, targetPlatforms, mediaIds, scheduleAt, timezone, teamId } =
        request.body as CreatePostBody;
      const userId = request.user.id;

      // Validate character limits per platform
      for (const platform of targetPlatforms) {
        const limit = PLATFORM_CHAR_LIMITS[platform as string];
        if (limit !== undefined && body.length > limit) {
          return reply.status(422).send({
            error: 'character_limit_exceeded',
            platform,
            limit,
            actual: body.length,
          });
        }
      }

      // Find active platform connections for each target platform
      const connections: Record<string, string> = {};
      for (const platform of targetPlatforms) {
        const connection = await prisma.platformConnection.findFirst({
          where: { userId, platform, status: 'active' },
        });
        if (!connection) {
          return reply.status(400).send({ error: 'platform_connection_not_found', platform });
        }
        connections[platform as string] = connection.id;
      }

      // Create the Post record
      const post = await prisma.post.create({
        data: {
          body,
          createdBy: userId,
          teamId: teamId ?? null,
          targetPlatforms,
          status: 'draft',
        },
      });

      // Create PlatformPost records
      await prisma.platformPost.createMany({
        data: targetPlatforms.map((platform: Platform) => ({
          postId: post.id,
          platform,
          platformConnectionId: connections[platform as string],
          status: 'pending',
        })),
      });

      // Link media if provided
      if (mediaIds && mediaIds.length > 0) {
        await prisma.media.updateMany({
          where: { id: { in: mediaIds }, uploaderId: userId },
          data: { postId: post.id },
        });
      }

      // Create schedule if provided
      if (scheduleAt) {
        await prisma.schedule.create({
          data: {
            postId: post.id,
            scheduledAt: new Date(scheduleAt),
            timezone: timezone ?? 'UTC',
            status: 'pending',
          },
        });
      }

      // Return post with platformPosts
      const result = await prisma.post.findUnique({
        where: { id: post.id },
        include: { platformPosts: true },
      });

      return reply.status(201).send(result);
    },
  );

  // GET /posts/:id
  app.get(
    '/posts/:id',
    { preHandler: requireAuth([]) },
    async (request: { params: { id: string } }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) => {
      const { id } = request.params;

      const post = await prisma.post.findUnique({
        where: { id },
        include: { platformPosts: true, media: true },
      });

      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      return reply.status(200).send(post);
    },
  );

  // PUT /posts/:id
  app.put(
    '/posts/:id',
    { preHandler: requireRole('admin', 'editor') },
    async (request: { params: { id: string }; body: UpdatePostBody }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) => {
      const { id } = request.params;
      const { body, targetPlatforms } = request.body as UpdatePostBody;

      const post = await prisma.post.findUnique({
        where: { id },
        include: { platformPosts: true },
      });

      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      // Reject if any platform post is published (Req 4.4)
      const hasPublished = post.platformPosts.some((pp: { status: string }) => pp.status === 'published');
      if (hasPublished) {
        return reply.status(409).send({ error: 'post_already_published' });
      }

      // Reject if post is pending approval (Req 9.6)
      if (post.status === 'pending_approval') {
        return reply.status(409).send({ error: 'post_pending_approval' });
      }

      // Validate character limits if body is being updated
      const effectivePlatforms = targetPlatforms ?? (post.targetPlatforms as Platform[]);
      if (body !== undefined) {
        for (const platform of effectivePlatforms) {
          const limit = PLATFORM_CHAR_LIMITS[platform as string];
          if (limit !== undefined && body.length > limit) {
            return reply.status(422).send({
              error: 'character_limit_exceeded',
              platform,
              limit,
              actual: body.length,
            });
          }
        }
      }

      const updated = await prisma.post.update({
        where: { id },
        data: {
          ...(body !== undefined && { body }),
          ...(targetPlatforms !== undefined && { targetPlatforms }),
        },
        include: { platformPosts: true, media: true },
      });

      return reply.status(200).send(updated);
    },
  );

  // DELETE /posts/:id
  app.delete(
    '/posts/:id',
    { preHandler: requireRole('admin', 'editor') },
    async (request: { params: { id: string } }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) => {
      const { id } = request.params;

      const post = await prisma.post.findUnique({
        where: { id },
      });

      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      // Reject deletion of published posts (Req 4.6)
      if (post.status === 'published') {
        return reply.status(409).send({ error: 'post_already_published' });
      }

      // Delete post — cascade deletes platformPosts and schedules via ON DELETE CASCADE
      await prisma.post.delete({ where: { id } });

      return reply.status(204).send(null);
    },
  );
}
