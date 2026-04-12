import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from 'smas-shared';

const PLACEHOLDER_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const METHOD_TO_ACTION: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

export function createAuditLogger(prisma: PrismaClient) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Only log authenticated CUD requests that succeeded
    if (!request.user) return;

    const method = request.method.toUpperCase();
    const actionType = METHOD_TO_ACTION[method];
    if (!actionType) return;

    const statusCode = reply.statusCode;
    if (statusCode < 200 || statusCode >= 300) return;

    const segments = request.url.split('?')[0].split('/').filter(Boolean);
    const resourceType = segments[0] ?? 'unknown';
    const secondSegment = segments[1];
    const resourceId =
      secondSegment && UUID_REGEX.test(secondSegment) ? secondSegment : PLACEHOLDER_UUID;

    const ipAddress =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ??
      request.ip;

    // Fire-and-forget — never block the response
    prisma.auditLog
      .create({
        data: {
          userId: request.user.id,
          actionType,
          resourceType,
          resourceId,
          ipAddress,
        },
      })
      .catch(() => {
        // Silently swallow errors to avoid impacting the response
      });
  };
}
