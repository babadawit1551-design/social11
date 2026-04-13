import amqplib from 'amqplib';
import { PrismaClient } from 'smas-shared';
import { PUBLISH_QUEUE, PUBLISH_DLQ } from 'smas-shared';
import { processPublishMessage, type PublishMessage } from '../../workers/publisher/src/publisher';
import { dispatchWebhookEvent } from '../../workers/publisher/src/webhookDispatcher';

const PUBLISH_DLX = 'publish_dlx';
const MAX_RETRIES = 3;

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

      await channel.assertExchange(PUBLISH_DLX, 'direct', { durable: true });
      await channel.assertQueue(PUBLISH_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': PUBLISH_DLX,
          'x-dead-letter-routing-key': PUBLISH_DLQ,
        },
      });
      await channel.assertQueue(PUBLISH_DLQ, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': PUBLISH_QUEUE,
        },
      });
      await channel.bindQueue(PUBLISH_DLQ, PUBLISH_DLX, PUBLISH_DLQ);
      channel.prefetch(1);
      console.log('[publisher] Connected to RabbitMQ');
      return { connection, channel };
    } catch (err) {
      console.error(`[publisher] Connection attempt ${attempt}/${retries} failed:`, err);
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Failed to connect to RabbitMQ');
}

export async function startPublisher(prisma: PrismaClient, rabbitmqUrl: string): Promise<void> {
  const { connection, channel } = await connectWithRetry(rabbitmqUrl);

  (connection as NodeJS.EventEmitter).on('close', () => {
    console.error('[publisher] RabbitMQ connection closed — restarting in 5s');
    setTimeout(() => startPublisher(prisma, rabbitmqUrl).catch(console.error), 5000);
  });

  channel.consume(PUBLISH_QUEUE, async (msg) => {
    if (!msg) return;

    const headers = msg.properties.headers ?? {};
    const retryCount: number = typeof headers['x-retry-count'] === 'number'
      ? headers['x-retry-count'] : 0;

    let message: PublishMessage;
    try {
      message = JSON.parse(msg.content.toString()) as PublishMessage;
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    try {
      await processPublishMessage(prisma, message);
      channel.ack(msg);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (retryCount >= MAX_RETRIES) {
        await prisma.platformPost.updateMany({
          where: { postId: message.postId, status: 'pending' },
          data: { status: 'failed', errorMessage },
        });
        await prisma.post.update({
          where: { id: message.postId },
          data: { status: 'failed' as any },
        });
        await dispatchWebhookEvent(prisma, 'post.failed', {
          postId: message.postId,
          errorMessage,
          failedAt: new Date().toISOString(),
        }).catch(console.error);
        channel.ack(msg);
      } else {
        const nextRetry = retryCount + 1;
        const delay = retryDelayMs(nextRetry);
        await prisma.platformPost.updateMany({
          where: { postId: message.postId, status: 'pending' },
          data: { retryCount: nextRetry },
        }).catch(console.error);
        channel.publish(PUBLISH_DLX, PUBLISH_DLQ, msg.content, {
          persistent: true,
          expiration: String(delay),
          headers: { ...headers, 'x-retry-count': nextRetry },
        });
        channel.ack(msg);
      }
    }
  });
}
