import Fastify from 'fastify';
import { PrismaClient } from 'smas-shared';
import { getRedisClient, closeRedisClient } from 'smas-shared';
import { authRoutes } from './routes/auth';
import { oauthRoutes } from './routes/oauth';
import { createAuditLogger } from './middleware/audit';
import { config } from './config';

const app = Fastify({ logger: true });

const prisma = new PrismaClient();

app.get('/health', async () => ({ status: 'ok', service: 'auth' }));

const start = async () => {
  try {
    await prisma.$connect();
    getRedisClient(config.REDIS_URL);

    await authRoutes(app, prisma);
    await oauthRoutes(app, prisma);

    app.addHook('onResponse', createAuditLogger(prisma));

    await app.listen({ port: 8001, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  await closeRedisClient();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
