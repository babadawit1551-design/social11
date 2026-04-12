import Fastify from 'fastify';
import { PrismaClient } from 'smas-shared';
import { config } from './config';
import { schedulesRoutes } from './routes/schedules';
import { startSchedulePoller } from './cron/schedulePoller';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

app.get('/health', async () => ({ status: 'ok', service: 'schedule' }));

const start = async () => {
  try {
    await prisma.$connect();
    await schedulesRoutes(app, prisma);

    // Start the 60-second cron job to enqueue due posts
    const poller = startSchedulePoller(prisma, config.RABBITMQ_URL);
    poller.start();
    app.log.info('[schedulePoller] Cron job started (every 60 seconds)');

    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
