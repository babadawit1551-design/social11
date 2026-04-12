import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from 'smas-shared';
import { config } from '../config';

export type Role = 'admin' | 'editor' | 'viewer';

export function requireAuth(allowedRoles?: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    const token = authHeader.slice(7);

    let payload: { sub: string; role: string };
    try {
      payload = verifyAccessToken(token, config.SECRET_KEY);
    } catch {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    request.user = { id: payload.sub, role: payload.role };

    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(payload.role as Role)) {
        return reply.status(403).send({ error: 'forbidden' });
      }
    }
  };
}
