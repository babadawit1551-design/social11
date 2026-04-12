export declare const PLATFORM_CHAR_LIMITS: Record<string, number>;
export declare const RATE_LIMIT_PER_DAY = 50;
export declare const PUBLISH_QUEUE = "publish_queue";
export declare const PUBLISH_DLQ = "publish_queue.dlq";
export declare const WEBHOOK_EVENTS: readonly ["post.published", "post.failed", "post.approved", "post.rejected", "platform_connection.expired"];
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export declare const ACCEPTED_IMAGE_TYPES: string[];
export declare const ACCEPTED_VIDEO_TYPES: string[];
export declare const MAX_VIDEO_SIZE_BYTES: number;
//# sourceMappingURL=constants.d.ts.map