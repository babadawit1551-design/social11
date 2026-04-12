export const config = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  SECRET_KEY: process.env.SECRET_KEY ?? '',
  PORT: parseInt(process.env.PORT ?? '8004', 10),
};
