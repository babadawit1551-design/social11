"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const smas_shared_1 = require("smas-shared");
const smas_shared_2 = require("smas-shared");
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const rbac_1 = require("../middleware/rbac");
const loginSchema = {
    body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
    },
};
async function authRoutes(app, prisma) {
    app.post('/auth/login', { schema: loginSchema }, async (request, reply) => {
        const { email, password } = request.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return reply.status(401).send({ error: 'invalid_credentials' });
        }
        const passwordMatch = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!passwordMatch) {
            return reply.status(401).send({ error: 'invalid_credentials' });
        }
        const accessToken = (0, smas_shared_2.createAccessToken)(user.id, user.role, config_1.config.SECRET_KEY, config_1.config.ACCESS_TOKEN_EXPIRE_MINUTES);
        const refreshToken = (0, smas_shared_2.createRefreshToken)(user.id, config_1.config.SECRET_KEY, config_1.config.REFRESH_TOKEN_EXPIRE_DAYS);
        const tokenHash = crypto_1.default.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = new Date(Date.now() + config_1.config.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
        await prisma.refreshToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });
        const redis = (0, smas_shared_1.getRedisClient)(config_1.config.REDIS_URL);
        const ttlSeconds = config_1.config.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60;
        await redis.set(`refresh_token:${tokenHash}`, user.id, 'EX', ttlSeconds);
        return reply.status(200).send({ access_token: accessToken, refresh_token: refreshToken });
    });
    const refreshSchema = {
        body: {
            type: 'object',
            required: ['refresh_token'],
            properties: {
                refresh_token: { type: 'string', minLength: 1 },
            },
            additionalProperties: false,
        },
    };
    app.post('/auth/refresh', { schema: refreshSchema }, async (request, reply) => {
        const { refresh_token } = request.body;
        const tokenHash = crypto_1.default.createHash('sha256').update(refresh_token).digest('hex');
        const redis = (0, smas_shared_1.getRedisClient)(config_1.config.REDIS_URL);
        const userId = await redis.get(`refresh_token:${tokenHash}`);
        if (!userId) {
            return reply.status(401).send({ error: 'invalid_refresh_token' });
        }
        const storedToken = await prisma.refreshToken.findFirst({
            where: {
                tokenHash,
                revoked: false,
                expiresAt: { gt: new Date() },
            },
        });
        if (!storedToken) {
            return reply.status(401).send({ error: 'invalid_refresh_token' });
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return reply.status(401).send({ error: 'invalid_refresh_token' });
        }
        const newAccessToken = (0, smas_shared_2.createAccessToken)(user.id, user.role, config_1.config.SECRET_KEY, config_1.config.ACCESS_TOKEN_EXPIRE_MINUTES);
        const newRefreshToken = (0, smas_shared_2.createRefreshToken)(user.id, config_1.config.SECRET_KEY, config_1.config.REFRESH_TOKEN_EXPIRE_DAYS);
        const newTokenHash = crypto_1.default.createHash('sha256').update(newRefreshToken).digest('hex');
        const newExpiresAt = new Date(Date.now() + config_1.config.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
        await prisma.refreshToken.update({
            where: { id: storedToken.id },
            data: { revoked: true },
        });
        await redis.del(`refresh_token:${tokenHash}`);
        await prisma.refreshToken.create({
            data: {
                userId: user.id,
                tokenHash: newTokenHash,
                expiresAt: newExpiresAt,
            },
        });
        const ttlSeconds = config_1.config.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60;
        await redis.set(`refresh_token:${newTokenHash}`, user.id, 'EX', ttlSeconds);
        return reply.status(200).send({ access_token: newAccessToken, refresh_token: newRefreshToken });
    });
    const logoutSchema = {
        body: {
            type: 'object',
            required: ['refresh_token'],
            properties: {
                refresh_token: { type: 'string', minLength: 1 },
            },
            additionalProperties: false,
        },
    };
    app.post('/auth/logout', { schema: logoutSchema }, async (request, reply) => {
        const { refresh_token } = request.body;
        const tokenHash = crypto_1.default.createHash('sha256').update(refresh_token).digest('hex');
        await prisma.refreshToken.updateMany({
            where: { tokenHash },
            data: { revoked: true },
        });
        const redis = (0, smas_shared_1.getRedisClient)(config_1.config.REDIS_URL);
        await redis.del(`refresh_token:${tokenHash}`);
        return reply.status(204).send();
    });
    // GET /users/me — requires valid JWT (any role)
    app.get('/users/me', { preHandler: (0, rbac_1.requireAuth)() }, async (request, reply) => {
        const user = await prisma.user.findUnique({
            where: { id: request.user.id },
            select: { id: true, email: true, role: true, teamId: true, createdAt: true },
        });
        if (!user) {
            return reply.status(404).send({ error: 'user_not_found' });
        }
        return reply.status(200).send(user);
    });
    // GET /audit-logs — Admin only
    app.get('/audit-logs', { preHandler: (0, rbac_1.requireRole)('admin') }, async (request, reply) => {
        const { userId, resourceType, actionType, from, to, page = '1', limit = '50' } = request.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;
        const where = {
            ...(userId ? { userId } : {}),
            ...(resourceType ? { resourceType } : {}),
            ...(actionType ? { actionType } : {}),
            ...(from || to
                ? {
                    createdAt: {
                        ...(from ? { gte: new Date(from) } : {}),
                        ...(to ? { lte: new Date(to) } : {}),
                    },
                }
                : {}),
        };
        const [total, entries] = await Promise.all([
            prisma.auditLog.count({ where }),
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            }),
        ]);
        return reply.status(200).send({
            data: entries,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
            },
        });
    });
}
//# sourceMappingURL=auth.js.map