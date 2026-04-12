import Redis from 'ioredis';

let _client: Redis | null = null;

export function getRedisClient(url?: string): Redis {
  if (!_client) {
    _client = new Redis(url ?? process.env.REDIS_URL ?? 'redis://localhost:6379');
  }
  return _client;
}

export function closeRedisClient(): Promise<void> {
  if (_client) {
    const c = _client;
    _client = null;
    return c.quit().then(() => undefined);
  }
  return Promise.resolve();
}
