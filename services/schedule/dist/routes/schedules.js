"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulesRoutes = schedulesRoutes;
const auth_1 = require("../middleware/auth");
const smas_shared_1 = require("smas-shared");
const rateLimit_1 = require("../lib/rateLimit");
const smas_shared_2 = require("smas-shared");
const config_1 = require("../config");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function schedulesRoutes(app, prisma) {
    // POST /schedules
    app.post('/schedules', { preHandler: (0, auth_1.requireAuth)(['admin', 'editor']) }, async (request, reply) => {
        const { postId, scheduledAt, timezone } = request.body;
        const { id: userId, role } = request.user;
        const post = await prisma.post.findUnique({ where: { id: postId } });
        if (!post) {
            return reply.status(404).send({ error: 'post_not_found' });
        }
        // Only admin can schedule any post; editors can only schedule their own
        if (role !== 'admin' && post.createdBy !== userId) {
            return reply.status(403).send({ error: 'forbidden' });
        }
        const allowedStatuses = ['approved', 'draft'];
        if (!allowedStatuses.includes(post.status)) {
            return reply.status(409).send({ error: 'invalid_post_status', current: post.status });
        }
        const existing = await prisma.schedule.findUnique({ where: { postId } });
        if (existing) {
            return reply.status(409).send({ error: 'schedule_already_exists' });
        }
        const schedule = await prisma.schedule.create({
            data: {
                postId,
                scheduledAt: new Date(scheduledAt),
                timezone,
                status: 'pending',
            },
        });
        await prisma.post.update({
            where: { id: postId },
            data: { status: 'scheduled' },
        });
        return reply.status(201).send(schedule);
    });
    // GET /schedules/:postId
    app.get('/schedules/:postId', { preHandler: (0, auth_1.requireAuth)() }, async (request, reply) => {
        const { postId } = request.params;
        const schedule = await prisma.schedule.findUnique({ where: { postId } });
        if (!schedule) {
            return reply.status(404).send({ error: 'schedule_not_found' });
        }
        return reply.status(200).send(schedule);
    });
    // DELETE /schedules/:id
    app.delete('/schedules/:id', { preHandler: (0, auth_1.requireRole)('admin', 'editor') }, async (request, reply) => {
        const { id } = request.params;
        const schedule = await prisma.schedule.findUnique({ where: { id } });
        if (!schedule) {
            return reply.status(404).send({ error: 'schedule_not_found' });
        }
        await prisma.schedule.delete({ where: { id } });
        await prisma.post.update({
            where: { id: schedule.postId },
            data: { status: 'draft' },
        });
        return reply.status(204).send();
    });
    // GET /rate-limit/:platformConnectionId — check current rate limit status
    app.get('/rate-limit/:platformConnectionId', { preHandler: (0, auth_1.requireAuth)() }, async (request, reply) => {
        const { platformConnectionId } = request.params;
        const redis = (0, smas_shared_1.getRedisClient)(config_1.config.REDIS_URL);
        const now = new Date();
        const count = await (0, rateLimit_1.getRateLimitCount)(redis, platformConnectionId, now);
        const resetsAt = (0, rateLimit_1.getUtcMidnightIso)(now);
        const remaining = Math.max(0, smas_shared_2.RATE_LIMIT_PER_DAY - count);
        if (count >= smas_shared_2.RATE_LIMIT_PER_DAY) {
            return reply.status(429).send({
                error: 'rate_limit_exceeded',
                resets_at: resetsAt,
                count,
                limit: smas_shared_2.RATE_LIMIT_PER_DAY,
                remaining: 0,
            });
        }
        return reply.status(200).send({
            count,
            limit: smas_shared_2.RATE_LIMIT_PER_DAY,
            remaining,
            resets_at: resetsAt,
        });
    });
}
//# sourceMappingURL=schedules.js.map