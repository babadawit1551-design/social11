"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueDuePosts = enqueueDuePosts;
exports.startSchedulePoller = startSchedulePoller;
const node_cron_1 = __importDefault(require("node-cron"));
const amqplib_1 = __importDefault(require("amqplib"));
const smas_shared_1 = require("smas-shared");
const smas_shared_2 = require("smas-shared");
const rateLimit_1 = require("../lib/rateLimit");
const config_1 = require("../config");
const PUBLISH_QUEUE = 'publish_queue';
async function connectRabbitMQ(rabbitmqUrl) {
    const connection = await amqplib_1.default.connect(rabbitmqUrl);
    const channel = await connection.createChannel();
    await channel.assertQueue(PUBLISH_QUEUE, { durable: true });
    return { connection, channel };
}
async function enqueueDuePosts(prisma, channel, redis) {
    const now = new Date();
    // Find pending schedules that are due, including the related post and its platform posts
    const dueSchedules = await prisma.schedule.findMany({
        where: {
            status: 'pending',
            scheduledAt: { lte: now },
        },
        include: {
            post: {
                include: {
                    platformPosts: true,
                },
            },
        },
    });
    if (dueSchedules.length === 0)
        return 0;
    // Fetch team info for each post to determine approval workflow setting
    const teamIds = [
        ...new Set(dueSchedules
            .map((s) => s.post.teamId)
            .filter((id) => id !== null)),
    ];
    const teams = teamIds.length > 0 ? await prisma.team.findMany({ where: { id: { in: teamIds } } }) : [];
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    let enqueued = 0;
    for (const schedule of dueSchedules) {
        const post = schedule.post;
        const team = post.teamId ? teamMap.get(post.teamId) : undefined;
        const approvalEnabled = team?.approvalWorkflowEnabled ?? false;
        // Eligible if approved, or if approval workflow is disabled and post is scheduled
        const isEligible = post.status === 'approved' || (!approvalEnabled && post.status === 'scheduled');
        if (!isEligible)
            continue;
        // Check rate limits for each platform connection before enqueuing
        const platformPosts = post.platformPosts;
        let rateLimitExceeded = false;
        const exceededConnections = [];
        for (const platformPost of platformPosts) {
            const result = await (0, rateLimit_1.checkAndIncrementRateLimit)(redis, platformPost.platformConnectionId, now);
            if (!result.allowed) {
                rateLimitExceeded = true;
                exceededConnections.push(platformPost.platformConnectionId);
            }
        }
        if (rateLimitExceeded) {
            // Notify user and retain post in scheduled status (do not enqueue)
            const resetsAt = (0, rateLimit_1.getUtcMidnightIso)(now);
            console.warn(`[schedulePoller] Rate limit exceeded for post ${post.id} on connection(s): ${exceededConnections.join(', ')}. ` +
                `Post retained in scheduled status. Rate limit resets at ${resetsAt}.`);
            // Notify the post owner by logging — in a full system this would send a notification
            // via a notification service or webhook event
            await notifyRateLimitExceeded(prisma, post.id, exceededConnections, resetsAt);
            continue;
        }
        const message = JSON.stringify({ postId: post.id, scheduleId: schedule.id });
        channel.sendToQueue(PUBLISH_QUEUE, Buffer.from(message), { persistent: true });
        await prisma.schedule.update({
            where: { id: schedule.id },
            data: { status: 'enqueued' },
        });
        enqueued++;
    }
    return enqueued;
}
/**
 * Notifies the post owner that their post was not enqueued due to rate limiting.
 * Retains the post in `scheduled` status as required by Requirement 7.4.
 * In a full system this would dispatch a webhook event or push notification.
 */
async function notifyRateLimitExceeded(prisma, postId, exceededConnectionIds, resetsAt) {
    // Fetch the post with its creator to log the notification
    const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, createdBy: true },
    });
    if (!post)
        return;
    // Log the rate limit notification (a real implementation would send an email/push/webhook)
    console.info(`[schedulePoller] NOTIFICATION: User ${post.createdBy} — post ${postId} could not be published ` +
        `because the daily rate limit (${smas_shared_1.RATE_LIMIT_PER_DAY} posts/day) was reached for platform connection(s): ` +
        `${exceededConnectionIds.join(', ')}. The post remains scheduled and will be retried after ${resetsAt}.`);
}
function startSchedulePoller(prisma, rabbitmqUrl) {
    let channel = null;
    let connection = null;
    const redis = (0, smas_shared_2.getRedisClient)(config_1.config.REDIS_URL);
    async function ensureChannel() {
        if (channel)
            return channel;
        const result = await connectRabbitMQ(rabbitmqUrl);
        connection = result.connection;
        channel = result.channel;
        connection.on('close', () => {
            channel = null;
            connection = null;
        });
        connection.on('error', () => {
            channel = null;
            connection = null;
        });
        return channel;
    }
    // Run every 60 seconds
    const task = node_cron_1.default.schedule('*/1 * * * *', async () => {
        try {
            const ch = await ensureChannel();
            const count = await enqueueDuePosts(prisma, ch, redis);
            if (count > 0) {
                console.log(`[schedulePoller] Enqueued ${count} post(s) to ${PUBLISH_QUEUE}`);
            }
        }
        catch (err) {
            console.error('[schedulePoller] Error during poll:', err);
            channel = null;
            connection = null;
        }
    });
    return task;
}
//# sourceMappingURL=schedulePoller.js.map