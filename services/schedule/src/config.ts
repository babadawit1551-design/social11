export const config = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  RABBITMQ_URL: process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
  SECRET_KEY: process.env.SECRET_KEY ?? '',
  PORT: parseInt(process.env.PORT ?? '8003', 10),
};
