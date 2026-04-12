import Fastify from 'fastify';
import { PrismaClient } from 'smas-shared';
import { config } from './config';
import { analyticsRoutes } from './routes/analytics';
import { startAnalyticsRefresher } from './cron/analyticsRefresher';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

app.get('/health', async () => ({ status: 'ok', service: 'analytics' }));

const start = async () => {
  try {
    await prisma.$connect();
    await analyticsRoutes(app, prisma);
    startAnalyticsRefresher(prisma);
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
