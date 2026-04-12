"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const smas_shared_1 = require("smas-shared");
const config_1 = require("../config");
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
function requireRole(...roles) {
    return requireAuth(roles);
}
//# sourceMappingURL=auth.js.map