import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { PrismaClient } from 'smas-shared';
import { config } from './config';
import { postsRoutes } from './routes/posts';
import { mediaRoutes } from './routes/media';
import { aiRoutes } from './routes/ai';
import { approvalRoutes } from './routes/approval';
import { webhooksRoutes } from './routes/webhooks';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

app.get('/health', async () => ({ status: 'ok', service: 'content' }));

const start = async () => {
  try {
    await prisma.$connect();
    await app.register(multipart, { limits: { fileSize: MAX_MULTIPART_SIZE } });
    await postsRoutes(app, prisma);
    await mediaRoutes(app, prisma);
    await aiRoutes(app, prisma);
    await approvalRoutes(app, prisma);
    await webhooksRoutes(app, prisma);
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Allow up to 512 MB + overhead for multipart parsing
const MAX_MULTIPART_SIZE = 513 * 1024 * 1024;

start();
