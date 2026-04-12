"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = getRedisClient;
exports.closeRedisClient = closeRedisClient;
const ioredis_1 = __importDefault(require("ioredis"));
let _client = null;
function getRedisClient(url) {
    if (!_client) {
        _client = new ioredis_1.default(url ?? process.env.REDIS_URL ?? 'redis://localhost:6379');
    }
    return _client;
}
function closeRedisClient() {
    if (_client) {
        const c = _client;
        _client = null;
        return c.quit().then(() => undefined);
    }
    return Promise.resolve();
}
//# sourceMappingURL=redis.js.map