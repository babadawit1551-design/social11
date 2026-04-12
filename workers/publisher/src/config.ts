export const config = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  RABBITMQ_URL: process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
  PORT: parseInt(process.env.PORT ?? '8005', 10),
};
