import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from 'smas-shared';
export declare function createAuditLogger(prisma: PrismaClient): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
