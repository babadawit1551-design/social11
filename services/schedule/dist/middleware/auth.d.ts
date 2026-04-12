import { FastifyRequest, FastifyReply } from 'fastify';
export type Role = 'admin' | 'editor' | 'viewer';
export declare function requireAuth(allowedRoles?: Role[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
export declare function requireRole(...roles: Role[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
