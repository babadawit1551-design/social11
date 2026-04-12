"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const smas_shared_1 = require("smas-shared");
const smas_shared_2 = require("smas-shared");
const auth_1 = require("./routes/auth");
const oauth_1 = require("./routes/oauth");
const audit_1 = require("./middleware/audit");
const config_1 = require("./config");
const app = (0, fastify_1.default)({ logger: true });
const prisma = new smas_shared_1.PrismaClient();
app.get('/health', async () => ({ status: 'ok', service: 'auth' }));
const start = async () => {
    try {
        await prisma.$connect();
        (0, smas_shared_2.getRedisClient)(config_1.config.REDIS_URL);
        await (0, auth_1.authRoutes)(app, prisma);
        await (0, oauth_1.oauthRoutes)(app, prisma);
        app.addHook('onResponse', (0, audit_1.createAuditLogger)(prisma));
        await app.listen({ port: 8001, host: '0.0.0.0' });
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};
const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    await (0, smas_shared_2.closeRedisClient)();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
start();
//# sourceMappingURL=index.js.map