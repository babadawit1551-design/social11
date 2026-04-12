export const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
};

export const RATE_LIMIT_PER_DAY = 50;

export const PUBLISH_QUEUE = 'publish_queue';
export const PUBLISH_DLQ = 'publish_queue.dlq';

export const WEBHOOK_EVENTS = [
  'post.published',
  'post.failed',
  'post.approved',
  'post.rejected',
  'platform_connection.expired',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
export const MAX_VIDEO_SIZE_BYTES = 512 * 1024 * 1024; // 512 MB
