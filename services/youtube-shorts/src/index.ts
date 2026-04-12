import http from 'http';
import { execSync } from 'child_process';
import express, { Request, Response } from 'express';
import { config } from './config';
import { initSocketGateway } from './lib/socketGateway';
import channelsRouter from './routes/channels';
import jobsRouter from './routes/jobs';
import clipsRouter from './routes/clips';
import { startVideoProcessorWorker } from './workers/videoProcessor';
import { startYouTubeUploaderWorker } from './lib/youtubeUploader';

// Structured JSON logger (req 12.6)
export const logger = {
  info: (message: string, extra?: Record<string, unknown>) =>
    console.log(JSON.stringify({ service: 'youtube-shorts', level: 'info', message, timestamp: new Date().toISOString(), ...extra })),
  warn: (message: string, extra?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ service: 'youtube-shorts', level: 'warn', message, timestamp: new Date().toISOString(), ...extra })),
  error: (message: string, extra?: Record<string, unknown>) =>
    console.error(JSON.stringify({ service: 'youtube-shorts', level: 'error', message, timestamp: new Date().toISOString(), ...extra })),
};

// Run Prisma migrations before accepting requests (req 12.5)
try {
  logger.info('Running Prisma migrations...');
  execSync('npx prisma migrate deploy', {
    cwd: '../../shared',
    stdio: 'inherit',
    env: { ...process.env },
  });
  logger.info('Prisma migrations complete');
} catch (err) {
  logger.error('Prisma migration failed', { detail: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}

const app = express();

app.use(express.json());

// Health endpoint (req 12.4)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Mount route handlers
app.use('/api/youtube-shorts/channels', channelsRouter);
app.use('/api/youtube-shorts/jobs', jobsRouter);
app.use('/api/youtube-shorts/clips', clipsRouter);

// Create HTTP server so Socket.io can attach (req 9.1)
const httpServer = http.createServer(app);

// Attach Socket.io gateway (req 9.1, 9.6)
initSocketGateway(httpServer);
logger.info('Socket.io gateway initialised');

// Start BullMQ workers
startVideoProcessorWorker();
logger.info('VideoProcessor worker started');
startYouTubeUploaderWorker();
logger.info('YouTubeUploader worker started');

httpServer.listen(config.PORT, '0.0.0.0', () => {
  logger.info(`Server listening on port ${config.PORT}`);
});

export { app, httpServer };
