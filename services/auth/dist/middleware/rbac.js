"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSIONS = void 0;
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const smas_shared_1 = require("smas-shared");
const config_1 = require("../config");
const ALL_PERMISSIONS = [
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
exports.PERMISSIONS = {
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
function requireAuth(allowedRoles) {
    return async (request, reply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'unauthorized' });
        }
        const token = authHeader.slice(7);
        let payload;
        try {
            payload = (0, smas_shared_1.verifyAccessToken)(token, config_1.config.SECRET_KEY);
        }
        catch {
            return reply.status(401).send({ error: 'unauthorized' });
        }
        request.user = { id: payload.sub, role: payload.role };
        if (allowedRoles && allowedRoles.length > 0) {
            if (!allowedRoles.includes(payload.role)) {
                return reply.status(403).send({ error: 'forbidden' });
            }
        }
    };
}
/**
 * Convenience wrapper — requires the user to have one of the specified roles.
 */
function requireRole(...roles) {
    return requireAuth(roles);
}
//# sourceMappingURL=rbac.js.map