import { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
import { getRedisClient } from 'smas-shared';
import { createAccessToken, createRefreshToken } from 'smas-shared';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../config';
import { requireAuth, requireRole } from '../middleware/rbac';

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
} as const;

export async function authRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    { schema: loginSchema },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return reply.status(401).send({ error: 'invalid_credentials' });
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        return reply.status(401).send({ error: 'invalid_credentials' });
      }

      const accessToken = createAccessToken(
        user.id,
        user.role,
        config.SECRET_KEY,
        config.ACCESS_TOKEN_EXPIRE_MINUTES,
      );

      const refreshToken = createRefreshToken(
        user.id,
        config.SECRET_KEY,
        config.REFRESH_TOKEN_EXPIRE_DAYS,
      );

      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      const expiresAt = new Date(
        Date.now() + config.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
      );

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      const redis = getRedisClient(config.REDIS_URL);
      const ttlSeconds = config.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60;
      await redis.set(`refresh_token:${tokenHash}`, user.id, 'EX', ttlSeconds);

      return reply.status(200).send({ access_token: accessToken, refresh_token: refreshToken });
    },
  );

  const refreshSchema = {
    body: {
      type: 'object',
      required: ['refresh_token'],
      properties: {
        refresh_token: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  } as const;

  app.post<{ Body: { refresh_token: string } }>(
    '/auth/refresh',
    { schema: refreshSchema },
    async (request, reply) => {
      const { refresh_token } = request.body;

      const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');

      const redis = getRedisClient(config.REDIS_URL);
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

      const newAccessToken = createAccessToken(
        user.id,
        user.role,
        config.SECRET_KEY,
        config.ACCESS_TOKEN_EXPIRE_MINUTES,
      );

      const newRefreshToken = createRefreshToken(
        user.id,
        config.SECRET_KEY,
        config.REFRESH_TOKEN_EXPIRE_DAYS,
      );

      const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
      const newExpiresAt = new Date(
        Date.now() + config.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
      );

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

      const ttlSeconds = config.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60;
      await redis.set(`refresh_token:${newTokenHash}`, user.id, 'EX', ttlSeconds);

      return reply.status(200).send({ access_token: newAccessToken, refresh_token: newRefreshToken });
    },
  );

  const logoutSchema = {
    body: {
      type: 'object',
      required: ['refresh_token'],
      properties: {
        refresh_token: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  } as const;

  app.post<{ Body: { refresh_token: string } }>(
    '/auth/logout',
    { schema: logoutSchema },
    async (request, reply) => {
      const { refresh_token } = request.body;

      const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');

      await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revoked: true },
      });

      const redis = getRedisClient(config.REDIS_URL);
      await redis.del(`refresh_token:${tokenHash}`);

      return reply.status(204).send();
    },
  );

  // GET /users/me — requires valid JWT (any role)
  app.get(
    '/users/me',
    { preHandler: requireAuth() },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user!.id },
        select: { id: true, email: true, role: true, teamId: true, createdAt: true },
      });

      if (!user) {
        return reply.status(404).send({ error: 'user_not_found' });
      }

      return reply.status(200).send(user);
    },
  );

  // GET /audit-logs — Admin only
  app.get<{
    Querystring: {
      userId?: string;
      resourceType?: string;
      actionType?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    };
  }>(
    '/audit-logs',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
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
    },
  );
}
