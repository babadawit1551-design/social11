import { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
/**
 * Returns true if the token expires within 24 hours from now, or is already expired.
 */
export declare function shouldRefreshToken(tokenExpiresAt: Date | null): boolean;
/**
 * Stub: notify the user that their platform connection has become invalid.
 * Real notification (email/webhook) will be implemented in a later task.
 */
export declare function notifyUserOfInvalidConnection(userId: string, platform: string): void;
export declare function oauthRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void>;
