import type { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
export declare function schedulesRoutes(app: FastifyInstance | any, prisma: PrismaClient): Promise<void>;
