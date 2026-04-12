import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from 'smas-shared';
import { config } from '../config';

export type Role = 'admin' | 'editor' | 'viewer';

export type Permission =
  | 'create_post'
  | 'update_post'
  | 'delete_post'
  | 'submit_approval'
  | 'upload_media'
  | 'delete_media'
  | 'generate_ai'
  | 'create_schedule'
  | 'delete_schedule'
  | 'view_analytics'
  | 'manage_webhooks'
  | 'manage_users'
  | 'view_audit_logs';

const ALL_PERMISSIONS: Permission[] = [
  'create_post',
  'update_post',
  'delete_post',
  'submit_approval',
  'upload_media',
  'delete_media',
  'generate_ai',
  'create_schedule',
  'delete_schedule',
  'view_analytics',
  'manage_webhooks',
  'manage_users',
  'view_audit_logs',
];

export const PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  editor: [
    'create_post',
    'update_post',
    'delete_post',
    'submit_approval',
    'upload_media',
    'delete_media',
    'generate_ai',
    'create_schedule',
    'delete_schedule',
    'view_analytics',
    'manage_webhooks',
  ],
  viewer: ['view_analytics'],
};

/**
 * Fastify preHandler hook factory.
 * If allowedRoles is provided, only those roles are permitted.
 * If omitted, any authenticated user is allowed.
 */
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

/**
 * Convenience wrapper — requires the user to have one of the specified roles.
 */
export function requireRole(...roles: Role[]) {
  return requireAuth(roles);
}
