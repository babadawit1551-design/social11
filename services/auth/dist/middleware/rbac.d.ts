import { FastifyRequest, FastifyReply } from 'fastify';
export type Role = 'admin' | 'editor' | 'viewer';
export type Permission = 'create_post' | 'update_post' | 'delete_post' | 'submit_approval' | 'upload_media' | 'delete_media' | 'generate_ai' | 'create_schedule' | 'delete_schedule' | 'view_analytics' | 'manage_webhooks' | 'manage_users' | 'view_audit_logs';
export declare const PERMISSIONS: Record<Role, Permission[]>;
/**
 * Fastify preHandler hook factory.
 * If allowedRoles is provided, only those roles are permitted.
 * If omitted, any authenticated user is allowed.
 */
export declare function requireAuth(allowedRoles?: Role[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
/**
 * Convenience wrapper — requires the user to have one of the specified roles.
 */
export declare function requireRole(...roles: Role[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
