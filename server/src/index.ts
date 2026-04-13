import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { PrismaClient } from 'smas-shared';
import { getRedisClient, closeRedisClient } from 'smas-shared';

// Auth routes
import { authRoutes } from '../../services/auth/src/routes/auth';
import { oauthRoutes } from '../../services/auth/src/routes/oauth';
import { createAuditLogger } from '../../services/auth/src/middleware/audit';

// Content routes
import { postsRoutes } from '../../services/content/src/routes/posts';
import { mediaRoutes } from '../../services/content/src/routes/media';
import { aiRoutes } from '../../services/content/src/routes/ai';
import { approvalRoutes } from '../../services/content/src/routes/approval';
import { webhooksRoutes } from '../../services/content/src/routes/webhooks';

// Schedule routes + cron
import { schedulesRoutes } from '../../services/schedule/src/routes/schedules';
import { startSchedulePoller } from '../../services/schedule/src/cron/schedulePoller';

// Analytics routes + cron
import { analyticsRoutes } from '../../services/analytics/src/routes/analytics';
import { startAnalyticsRefresher } from '../../services/analytics/src/cron/analyticsRefresher';

// Publisher worker
import { startPublisher } from './publisher';

const PORT = parseInt(process.env.PORT ?? '8000', 10);
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const REDIS_URL = process.env.REDIS_URL ?? '';
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? '';
const SECRET_KEY = process.env.SECRET_KEY ?? '';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

const MAX_MULTIPART_SIZE = 513 * 1024 * 1024;

app.get('/health', async () => ({ status: 'ok', service: 'smas-unified' }));

const start = async () => {
  try {
    await prisma.$connect();
    app.log.info('Connected to database');

    await app.register(cors, { origin: true });
    await app.register(multipart, { limits: { fileSize: MAX_MULTIPART_SIZE } });

    if (REDIS_URL) getRedisClient(REDIS_URL);

    // Register all routes
    await authRoutes(app, prisma);
    await oauthRoutes(app, prisma);
    await postsRoutes(app, prisma);
    await mediaRoutes(app, prisma);
    await aiRoutes(app, prisma);
    await approvalRoutes(app, prisma);
    await webhooksRoutes(app, prisma);
    await schedulesRoutes(app, prisma);
    await analyticsRoutes(app, prisma);

    app.addHook('onResponse', createAuditLogger(prisma));

    // Start cron jobs
    if (RABBITMQ_URL) {
      const poller = startSchedulePoller(prisma, RABBITMQ_URL);
      poller.start();
      app.log.info('Schedule poller started');

      // Start publisher worker in background
      startPublisher(prisma, RABBITMQ_URL).catch((err) =>
        app.log.error({ err }, 'Publisher worker error'),
      );
    }

    startAnalyticsRefresher(prisma);
    app.log.info('Analytics refresher started');

    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`Unified server running on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  if (REDIS_URL) await closeRedisClient();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
