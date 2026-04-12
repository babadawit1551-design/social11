import type { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { getRedisClient } from 'smas-shared';
import { getRateLimitCount, getUtcMidnightIso } from '../lib/rateLimit';
import { RATE_LIMIT_PER_DAY } from 'smas-shared';
import { config } from '../config';

interface ScheduleBody {
  postId: string;
  scheduledAt: string;
  timezone: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function schedulesRoutes(app: FastifyInstance | any, prisma: PrismaClient) {
  // POST /schedules
  app.post(
    '/schedules',
    { preHandler: requireAuth(['admin', 'editor']) },
    async (
      request: { body: ScheduleBody; user: { id: string; role: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { postId, scheduledAt, timezone } = request.body as ScheduleBody;
      const { id: userId, role } = request.user;

      const post = await prisma.post.findUnique({ where: { id: postId } });

      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      // Only admin can schedule any post; editors can only schedule their own
      if (role !== 'admin' && post.createdBy !== userId) {
        return reply.status(403).send({ error: 'forbidden' });
      }

      const allowedStatuses = ['approved', 'draft'];
      if (!allowedStatuses.includes(post.status)) {
        return reply.status(409).send({ error: 'invalid_post_status', current: post.status });
      }

      const existing = await prisma.schedule.findUnique({ where: { postId } });
      if (existing) {
        return reply.status(409).send({ error: 'schedule_already_exists' });
      }

      const schedule = await prisma.schedule.create({
        data: {
          postId,
          scheduledAt: new Date(scheduledAt),
          timezone,
          status: 'pending',
        },
      });

      await prisma.post.update({
        where: { id: postId },
        data: { status: 'scheduled' },
      });

      return reply.status(201).send(schedule);
    },
  );

  // GET /schedules/:postId
  app.get(
    '/schedules/:postId',
    { preHandler: requireAuth() },
    async (
      request: { params: { postId: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { postId } = request.params;

      const schedule = await prisma.schedule.findUnique({ where: { postId } });

      if (!schedule) {
        return reply.status(404).send({ error: 'schedule_not_found' });
      }

      return reply.status(200).send(schedule);
    },
  );

  // DELETE /schedules/:id
  app.delete(
    '/schedules/:id',
    { preHandler: requireRole('admin', 'editor') },
    async (
      request: { params: { id: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { id } = request.params;

      const schedule = await prisma.schedule.findUnique({ where: { id } });

      if (!schedule) {
        return reply.status(404).send({ error: 'schedule_not_found' });
      }

      await prisma.schedule.delete({ where: { id } });

      await prisma.post.update({
        where: { id: schedule.postId },
        data: { status: 'draft' },
      });

      return reply.status(204).send();
    },
  );

  // GET /rate-limit/:platformConnectionId — check current rate limit status
  app.get(
    '/rate-limit/:platformConnectionId',
    { preHandler: requireAuth() },
    async (
      request: { params: { platformConnectionId: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { platformConnectionId } = request.params;
      const redis = getRedisClient(config.REDIS_URL);
      const now = new Date();
      const count = await getRateLimitCount(redis, platformConnectionId, now);
      const resetsAt = getUtcMidnightIso(now);
      const remaining = Math.max(0, RATE_LIMIT_PER_DAY - count);

      if (count >= RATE_LIMIT_PER_DAY) {
        return reply.status(429).send({
          error: 'rate_limit_exceeded',
          resets_at: resetsAt,
          count,
          limit: RATE_LIMIT_PER_DAY,
          remaining: 0,
        });
      }

      return reply.status(200).send({
        count,
        limit: RATE_LIMIT_PER_DAY,
        remaining,
        resets_at: resetsAt,
      });
    },
  );
}
