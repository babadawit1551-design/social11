export const config = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  SECRET_KEY: process.env.SECRET_KEY ?? '',
  PORT: parseInt(process.env.PORT ?? '8002', 10),
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  MINIO_BUCKET: process.env.MINIO_BUCKET ?? 'smas-media',
  CDN_BASE_URL: process.env.CDN_BASE_URL ?? 'http://localhost:9000/smas-media',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
};
