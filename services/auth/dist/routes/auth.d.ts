import { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
export declare function authRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void>;
