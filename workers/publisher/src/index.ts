import amqplib from 'amqplib';
import { PrismaClient } from 'smas-shared';
import { PUBLISH_QUEUE, PUBLISH_DLQ } from 'smas-shared';
import { processPublishMessage, type PublishMessage } from './publisher';
import { dispatchWebhookEvent } from './webhookDispatcher';
import { config } from './config';

const prisma = new PrismaClient();

// Dead-letter exchange and queue names
const PUBLISH_DLX = 'publish_dlx';
const MAX_RETRIES = 3;

// Exponential backoff delays in ms: retry 1 → 1s, retry 2 → 2s, retry 3 → 4s
function retryDelayMs(retryCount: number): number {
  return 1000 * Math.pow(2, retryCount - 1);
}

type AmqplibConnection = Awaited<ReturnType<typeof amqplib.connect>>;
type AmqplibChannel = Awaited<ReturnType<AmqplibConnection['createChannel']>>;

async function connectWithRetry(
  url: string,
  retries = 10,
  delayMs = 3000,
): Promise<{ connection: AmqplibConnection; channel: AmqplibChannel }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await amqplib.connect(url);
      const channel = await connection.createChannel();

      // --- Dead-letter exchange (DLX) setup ---
      // Messages nack'd from publish_queue go to publish_dlx → publish_queue.dlq
      // After the per-message TTL expires in the DLQ, they route back to publish_queue
      await channel.assertExchange(PUBLISH_DLX, 'direct', { durable: true });

      // Main queue: sends failed messages to the DLX
      await channel.assertQueue(PUBLISH_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': PUBLISH_DLX,
          'x-dead-letter-routing-key': PUBLISH_DLQ,
        },
      });

      // DLQ: messages wait here for the TTL, then route back to publish_queue
      await channel.assertQueue(PUBLISH_DLQ, {
        durable: true,
        arguments: {
          // After TTL expires, send back to the default exchange → publish_queue
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': PUBLISH_QUEUE,
        },
      });

      // Bind DLQ to the DLX so nack'd messages land here
      await channel.bindQueue(PUBLISH_DLQ, PUBLISH_DLX, PUBLISH_DLQ);

      // Process one message at a time
      channel.prefetch(1);
      console.log('[publisher] Connected to RabbitMQ');
      return { connection, channel };
    } catch (err) {
      console.error(`[publisher] RabbitMQ connection attempt ${attempt}/${retries} failed:`, err);
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Failed to connect to RabbitMQ after all retries');
}

async function markPostFailed(postId: string, errorMessage: string): Promise<void> {
  // Mark all pending/retrying platform posts as failed
  await prisma.platformPost.updateMany({
    where: { postId, status: 'pending' },
    data: { status: 'failed', errorMessage },
  });

  // Update the parent post status to failed
  await prisma.post.update({
    where: { id: postId },
    data: { status: 'failed' as any },
  });

  console.log(`[publisher] Post ${postId} marked as failed after exhausting retries`);
}

async function startConsumer(): Promise<void> {
  await prisma.$connect();
  console.log('[publisher] Connected to database');

  const { connection, channel } = await connectWithRetry(config.RABBITMQ_URL);

  // Reconnect on connection close
  (connection as NodeJS.EventEmitter).on('close', () => {
    console.error('[publisher] RabbitMQ connection closed — restarting in 5s');
    setTimeout(() => startConsumer().catch(console.error), 5000);
  });

  (connection as NodeJS.EventEmitter).on('error', (err: Error) => {
    console.error('[publisher] RabbitMQ connection error:', err.message);
  });

  console.log(`[publisher] Waiting for messages on queue: ${PUBLISH_QUEUE}`);

  channel.consume(PUBLISH_QUEUE, async (msg) => {
    if (!msg) return;

    // Read retry count from message headers (set by us when requeueing to DLQ)
    const headers = msg.properties.headers ?? {};
    const retryCount: number = typeof headers['x-retry-count'] === 'number'
      ? headers['x-retry-count']
      : 0;

    let message: PublishMessage;
    try {
      message = JSON.parse(msg.content.toString()) as PublishMessage;
    } catch (err) {
      console.error('[publisher] Failed to parse message:', msg.content.toString());
      // Malformed message — discard without requeue
      channel.nack(msg, false, false);
      return;
    }

    try {
      await processPublishMessage(prisma, message);
      channel.ack(msg);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[publisher] Error processing post ${message.postId} (retry ${retryCount}/${MAX_RETRIES}): ${errorMessage}`,
      );

      if (retryCount >= MAX_RETRIES) {
        // Exhausted all retries — mark as permanently failed and discard
        console.error(
          `[publisher] Post ${message.postId} exhausted ${MAX_RETRIES} retries — marking failed`,
        );
        try {
          await markPostFailed(message.postId, errorMessage);
          await dispatchWebhookEvent(prisma, 'post.failed', {
            postId: message.postId,
            errorMessage,
            failedAt: new Date().toISOString(),
          }).catch((webhookErr) => {
            console.error('[publisher] Failed to dispatch post.failed webhook:', webhookErr);
          });
        } catch (dbErr) {
          console.error('[publisher] Failed to mark post as failed in DB:', dbErr);
        }
        // Ack to remove from queue (don't loop forever)
        channel.ack(msg);
      } else {
        // Schedule a retry via the DLQ with exponential backoff TTL
        const nextRetry = retryCount + 1;
        const delay = retryDelayMs(nextRetry);
        console.log(
          `[publisher] Scheduling retry ${nextRetry}/${MAX_RETRIES} for post ${message.postId} in ${delay}ms`,
        );

        // Increment retry_count on all pending platform posts in DB
        try {
          await prisma.platformPost.updateMany({
            where: { postId: message.postId, status: 'pending' },
            data: { retryCount: nextRetry },
          });
        } catch (dbErr) {
          console.error('[publisher] Failed to update retry_count in DB:', dbErr);
        }

        // Publish to DLQ with a per-message TTL so it routes back after the delay
        channel.publish(
          PUBLISH_DLX,
          PUBLISH_DLQ,
          msg.content,
          {
            persistent: true,
            expiration: String(delay), // per-message TTL in ms
            headers: {
              ...headers,
              'x-retry-count': nextRetry,
            },
          },
        );

        // Ack the original message (we've manually sent it to the DLQ)
        channel.ack(msg);
      }
    }
  });
}

startConsumer().catch((err) => {
  console.error('[publisher] Fatal startup error:', err);
  process.exit(1);
});
