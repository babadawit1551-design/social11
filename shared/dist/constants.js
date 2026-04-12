"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_VIDEO_SIZE_BYTES = exports.ACCEPTED_VIDEO_TYPES = exports.ACCEPTED_IMAGE_TYPES = exports.WEBHOOK_EVENTS = exports.PUBLISH_DLQ = exports.PUBLISH_QUEUE = exports.RATE_LIMIT_PER_DAY = exports.PLATFORM_CHAR_LIMITS = void 0;
exports.PLATFORM_CHAR_LIMITS = {
    twitter: 280,
    linkedin: 3000,
    facebook: 63206,
    instagram: 2200,
};
exports.RATE_LIMIT_PER_DAY = 50;
exports.PUBLISH_QUEUE = 'publish_queue';
exports.PUBLISH_DLQ = 'publish_queue.dlq';
exports.WEBHOOK_EVENTS = [
    'post.published',
    'post.failed',
    'post.approved',
    'post.rejected',
    'platform_connection.expired',
];
exports.ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
exports.ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
exports.MAX_VIDEO_SIZE_BYTES = 512 * 1024 * 1024; // 512 MB
//# sourceMappingURL=constants.js.map