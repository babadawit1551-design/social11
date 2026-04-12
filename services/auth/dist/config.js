"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    SECRET_KEY: process.env.SECRET_KEY ?? '',
    ACCESS_TOKEN_EXPIRE_MINUTES: parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES ?? '15', 10),
    REFRESH_TOKEN_EXPIRE_DAYS: parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS ?? '7', 10),
    // Frontend
    FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    // Encryption
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '',
    // Twitter / X OAuth
    TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID ?? '',
    TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET ?? '',
    TWITTER_REDIRECT_URI: process.env.TWITTER_REDIRECT_URI ?? '',
    // LinkedIn OAuth
    LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID ?? '',
    LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET ?? '',
    LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI ?? '',
    // Facebook OAuth
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID ?? '',
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET ?? '',
    FACEBOOK_REDIRECT_URI: process.env.FACEBOOK_REDIRECT_URI ?? '',
    // Instagram OAuth
    INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID ?? '',
    INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET ?? '',
    INSTAGRAM_REDIRECT_URI: process.env.INSTAGRAM_REDIRECT_URI ?? '',
};
//# sourceMappingURL=config.js.map