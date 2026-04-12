"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    RABBITMQ_URL: process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
    SECRET_KEY: process.env.SECRET_KEY ?? '',
    PORT: parseInt(process.env.PORT ?? '8003', 10),
};
//# sourceMappingURL=config.js.map