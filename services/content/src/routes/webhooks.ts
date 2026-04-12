import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
import { requireAuth } from '../middleware/auth';

const VALID_EVENT_TYPES = new Set([
  'post.published',
  'post.failed',
  'post.approved',
  'post.rejected',
  'platform_connection.expired',
]);

interface RegisterWebhookBody {
  url: string;
  eventTypes: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function webhooksRoutes(app: FastifyInstance | any, prisma: PrismaClient) {
  // POST /webhooks — register a new webhook
  app.post(
    '/webhooks',
    { preHandler: requireAuth([]) },
    async (
      request: { user: { id: string }; body: RegisterWebhookBody },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { url, eventTypes } = request.body as RegisterWebhookBody;

      if (!url || typeof url !== 'string') {
        return reply.status(400).send({ error: 'url is required' });
      }

      if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
        return reply.status(400).send({ error: 'eventTypes must be a non-empty array' });
      }

      const invalidTypes = eventTypes.filter((t) => !VALID_EVENT_TYPES.has(t));
      if (invalidTypes.length > 0) {
        return reply.status(400).send({
          error: 'invalid_event_types',
          invalid: invalidTypes,
          valid: Array.from(VALID_EVENT_TYPES),
        });
      }

      const secret = randomBytes(32).toString('hex');

      const webhook = await prisma.webhook.create({
        data: {
          userId: request.user.id,
          url,
          secret,
          eventTypes,
          enabled: true,
          consecutiveFailures: 0,
        },
      });

      // Return the webhook including the secret (only shown once)
      return reply.status(201).send(webhook);
    },
  );

  // GET /webhooks — list all webhooks for the authenticated user (no secret)
  app.get(
    '/webhooks',
    { preHandler: requireAuth([]) },
    async (
      request: { user: { id: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const webhooks = await prisma.webhook.findMany({
        where: { userId: request.user.id },
        select: {
          id: true,
          userId: true,
          url: true,
          eventTypes: true,
          enabled: true,
          consecutiveFailures: true,
          createdAt: true,
          // secret intentionally omitted
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send(webhooks);
    },
  );

  // DELETE /webhooks/:id — delete a webhook (only owner can delete)
  app.delete(
    '/webhooks/:id',
    { preHandler: requireAuth([]) },
    async (
      request: { user: { id: string }; params: { id: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { id } = request.params;

      const webhook = await prisma.webhook.findUnique({ where: { id } });

      if (!webhook) {
        return reply.status(404).send({ error: 'webhook_not_found' });
      }

      if (webhook.userId !== request.user.id) {
        return reply.status(403).send({ error: 'forbidden' });
      }

      await prisma.webhook.delete({ where: { id } });

      return reply.status(204).send(null);
    },
  );
}
