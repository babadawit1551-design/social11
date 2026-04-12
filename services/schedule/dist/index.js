"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const smas_shared_1 = require("smas-shared");
const config_1 = require("./config");
const schedules_1 = require("./routes/schedules");
const schedulePoller_1 = require("./cron/schedulePoller");
const app = (0, fastify_1.default)({ logger: true });
const prisma = new smas_shared_1.PrismaClient();
app.get('/health', async () => ({ status: 'ok', service: 'schedule' }));
const start = async () => {
    try {
        await prisma.$connect();
        await (0, schedules_1.schedulesRoutes)(app, prisma);
        // Start the 60-second cron job to enqueue due posts
        const poller = (0, schedulePoller_1.startSchedulePoller)(prisma, config_1.config.RABBITMQ_URL);
        poller.start();
        app.log.info('[schedulePoller] Cron job started (every 60 seconds)');
        await app.listen({ port: config_1.config.PORT, host: '0.0.0.0' });
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=index.js.map