import type { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
import { requireRole, requireAuth } from '../middleware/auth';
import { dispatchWebhookEvent } from '../lib/webhookDispatcher';

interface RejectBody {
  reason: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function approvalRoutes(app: FastifyInstance | any, prisma: PrismaClient) {
  // POST /posts/:id/submit-approval
  app.post(
    '/posts/:id/submit-approval',
    { preHandler: requireAuth(['admin', 'editor']) },
    async (
      request: { params: { id: string }; user: { id: string; role: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { id } = request.params;

      const post = await prisma.post.findUnique({ where: { id } });

      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      if (post.status !== 'draft' && post.status !== 'rejected') {
        return reply.status(409).send({ error: 'invalid_post_status', current: post.status });
      }

      const updated = await prisma.post.update({
        where: { id },
        data: { status: 'pending_approval' },
        include: { platformPosts: true, media: true },
      });

      // Notify team admins (stub — real notifications in a later task)
      if (post.teamId) {
        try {
          const admins = await prisma.user.findMany({
            where: { teamId: post.teamId, role: 'admin' },
            select: { id: true },
          });
          for (const admin of admins) {
            console.log(
              `[notify] Post ${id} submitted for approval — notifying admin userId=${admin.id}`,
            );
          }
        } catch (err) {
          console.error('[notify] Failed to fetch team admins for notification:', err);
        }
      }

      return reply.status(200).send(updated);
    },
  );

  // POST /posts/:id/approve
  app.post(
    '/posts/:id/approve',
    { preHandler: requireRole('admin') },
    async (
      request: { params: { id: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { id } = request.params;

      const post = await prisma.post.findUnique({ where: { id } });

      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      if (post.status !== 'pending_approval') {
        return reply.status(409).send({ error: 'invalid_post_status', current: post.status });
      }

      const updated = await prisma.post.update({
        where: { id },
        data: { status: 'approved' },
        include: { platformPosts: true, media: true },
      });

      // Fire post.approved webhook event (non-blocking)
      dispatchWebhookEvent(prisma, 'post.approved', {
        postId: id,
        teamId: post.teamId,
        createdBy: post.createdBy,
      }).catch((err) => console.error('[webhook] dispatch error for post.approved:', err));

      return reply.status(200).send(updated);
    },
  );

  // POST /posts/:id/reject
  app.post(
    '/posts/:id/reject',
    { preHandler: requireRole('admin') },
    async (
      request: { params: { id: string }; body: RejectBody },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { id } = request.params;
      const { reason } = request.body as RejectBody;

      const post = await prisma.post.findUnique({ where: { id } });

      if (!post) {
        return reply.status(404).send({ error: 'post_not_found' });
      }

      if (post.status !== 'pending_approval') {
        return reply.status(409).send({ error: 'invalid_post_status', current: post.status });
      }

      const updated = await prisma.post.update({
        where: { id },
        data: { status: 'rejected' },
        include: { platformPosts: true, media: true },
      });

      // Notify submitting editor (stub — real notifications in a later task)
      try {
        console.log(
          `[notify] Post ${id} rejected — notifying editor userId=${post.createdBy}, reason="${reason}"`,
        );
      } catch (err) {
        console.error('[notify] Failed to send rejection notification:', err);
      }

      // Fire post.rejected webhook event (non-blocking)
      dispatchWebhookEvent(prisma, 'post.rejected', {
        postId: id,
        teamId: post.teamId,
        createdBy: post.createdBy,
        reason,
      }).catch((err) => console.error('[webhook] dispatch error for post.rejected:', err));

      return reply.status(200).send(updated);
    },
  );
}
