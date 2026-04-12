import { createHmac } from 'crypto';
import { PrismaClient } from 'smas-shared';

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS_MS = [1000, 2000, 4000];

function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptDelivery(
  url: string,
  body: string,
  signature: string,
): Promise<{ ok: boolean; statusCode: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SMAS-Signature': signature },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: response.ok, statusCode: response.status };
  } catch {
    clearTimeout(timer);
    return { ok: false, statusCode: null };
  }
}

async function deliverToWebhook(
  prisma: PrismaClient,
  webhook: { id: string; url: string; secret: string },
  eventType: string,
  payloadBody: string,
): Promise<void> {
  const signature = signPayload(webhook.secret, payloadBody);
  const payloadJson = JSON.parse(payloadBody) as Record<string, unknown>;
  let delivered = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { ok, statusCode } = await attemptDelivery(webhook.url, payloadBody, signature);
    const isLast = attempt === MAX_ATTEMPTS;
    const status = ok ? 'delivered' : isLast ? 'failed' : 'pending';

    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType,
        payload: payloadJson as Parameters<typeof prisma.webhookDelivery.create>[0]['data']['payload'],
        attempt,
        status,
        responseCode: statusCode ?? undefined,
        deliveredAt: ok ? new Date() : undefined,
      },
    });

    if (ok) {
      delivered = true;
      await prisma.webhook.update({ where: { id: webhook.id }, data: { consecutiveFailures: 0 } });
      break;
    }

    if (!isLast) await sleep(BACKOFF_DELAYS_MS[attempt - 1]);
  }

  if (!delivered) {
    const updated = await prisma.webhook.update({
      where: { id: webhook.id },
      data: { consecutiveFailures: { increment: 1 } },
    });

    if (updated.consecutiveFailures >= 10) {
      await prisma.webhook.updateMany({
        where: { id: webhook.id, enabled: true, consecutiveFailures: { gte: 10 } },
        data: { enabled: false },
      });
      console.log(`[notify] Webhook ${webhook.id} auto-disabled after 10 consecutive failures`);
    }
  }
}

export async function dispatchWebhookEvent(
  prisma: PrismaClient,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { enabled: true, eventTypes: { has: eventType } },
  });

  if (webhooks.length === 0) return;

  const payloadBody = JSON.stringify({ event: eventType, ...payload });

  await Promise.allSettled(
    webhooks.map((webhook) => deliverToWebhook(prisma, webhook, eventType, payloadBody)),
  );
}
