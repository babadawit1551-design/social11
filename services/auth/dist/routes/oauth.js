"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRefreshToken = shouldRefreshToken;
exports.notifyUserOfInvalidConnection = notifyUserOfInvalidConnection;
exports.oauthRoutes = oauthRoutes;
const smas_shared_1 = require("smas-shared");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const rbac_1 = require("../middleware/rbac");
const crypto_2 = require("../utils/crypto");
const SUPPORTED_PLATFORMS = ['twitter', 'linkedin', 'facebook', 'instagram'];
const OAUTH_STATE_TTL = 600; // 10 minutes in seconds
function isValidPlatform(p) {
    return SUPPORTED_PLATFORMS.includes(p);
}
// ---------------------------------------------------------------------------
// Platform-specific: build authorization URL
// ---------------------------------------------------------------------------
function buildAuthorizationUrl(platform, state) {
    switch (platform) {
        case 'twitter': {
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: config_1.config.TWITTER_CLIENT_ID,
                redirect_uri: config_1.config.TWITTER_REDIRECT_URI,
                scope: 'tweet.read tweet.write users.read offline.access',
                state,
                code_challenge: 'challenge',
                code_challenge_method: 'plain',
            });
            return `https://twitter.com/i/oauth2/authorize?${params}`;
        }
        case 'linkedin': {
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: config_1.config.LINKEDIN_CLIENT_ID,
                redirect_uri: config_1.config.LINKEDIN_REDIRECT_URI,
                scope: 'r_organization_social w_organization_social r_basicprofile',
                state,
            });
            return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
        }
        case 'facebook': {
            const params = new URLSearchParams({
                client_id: config_1.config.FACEBOOK_APP_ID,
                redirect_uri: config_1.config.FACEBOOK_REDIRECT_URI,
                scope: 'pages_manage_posts,pages_read_engagement',
                state,
                response_type: 'code',
            });
            return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
        }
        case 'instagram': {
            const params = new URLSearchParams({
                client_id: config_1.config.INSTAGRAM_APP_ID,
                redirect_uri: config_1.config.INSTAGRAM_REDIRECT_URI,
                scope: 'instagram_basic,instagram_content_publish,instagram_manage_insights',
                state,
                response_type: 'code',
            });
            return `https://api.instagram.com/oauth/authorize?${params}`;
        }
    }
}
async function exchangeCodeForTokens(platform, code) {
    switch (platform) {
        case 'twitter': {
            const credentials = Buffer.from(`${config_1.config.TWITTER_CLIENT_ID}:${config_1.config.TWITTER_CLIENT_SECRET}`).toString('base64');
            const { data } = await axios_1.default.post('https://api.twitter.com/2/oauth2/token', new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: config_1.config.TWITTER_REDIRECT_URI,
                code_verifier: 'challenge',
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${credentials}`,
                },
            });
            return data;
        }
        case 'linkedin': {
            const { data } = await axios_1.default.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: config_1.config.LINKEDIN_REDIRECT_URI,
                client_id: config_1.config.LINKEDIN_CLIENT_ID,
                client_secret: config_1.config.LINKEDIN_CLIENT_SECRET,
            }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            return data;
        }
        case 'facebook': {
            const { data } = await axios_1.default.get('https://graph.facebook.com/v19.0/oauth/access_token', {
                params: {
                    client_id: config_1.config.FACEBOOK_APP_ID,
                    client_secret: config_1.config.FACEBOOK_APP_SECRET,
                    redirect_uri: config_1.config.FACEBOOK_REDIRECT_URI,
                    code,
                },
            });
            return data;
        }
        case 'instagram': {
            const form = new URLSearchParams({
                client_id: config_1.config.INSTAGRAM_APP_ID,
                client_secret: config_1.config.INSTAGRAM_APP_SECRET,
                grant_type: 'authorization_code',
                redirect_uri: config_1.config.INSTAGRAM_REDIRECT_URI,
                code,
            });
            const { data } = await axios_1.default.post('https://api.instagram.com/oauth/access_token', form, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            return { access_token: data.access_token };
        }
    }
}
async function fetchAndValidateAccount(platform, accessToken) {
    switch (platform) {
        case 'twitter': {
            const { data } = await axios_1.default.get('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${accessToken}` } });
            return { platformAccountId: data.data.id };
        }
        case 'linkedin': {
            // Fetch the authenticated member's profile to get their URN
            const { data: profile } = await axios_1.default.get('https://api.linkedin.com/v2/me', { headers: { Authorization: `Bearer ${accessToken}` } });
            // Verify the user has access to at least one organization (Company Page)
            const { data: orgs } = await axios_1.default.get('https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!orgs.elements || orgs.elements.length === 0) {
                const err = new Error('linkedin_company_page_required');
                err.code = 'linkedin_company_page_required';
                throw err;
            }
            return { platformAccountId: profile.id };
        }
        case 'facebook': {
            const { data } = await axios_1.default.get('https://graph.facebook.com/v19.0/me', {
                params: { access_token: accessToken, fields: 'id' },
            });
            return { platformAccountId: data.id };
        }
        case 'instagram': {
            // Fetch the Instagram user info
            const { data: igUser } = await axios_1.default.get('https://graph.instagram.com/me', {
                params: { access_token: accessToken, fields: 'id,account_type' },
            });
            // Only Business accounts are supported
            if (igUser.account_type !== 'BUSINESS') {
                const err = new Error('instagram_business_required');
                err.code = 'instagram_business_required';
                throw err;
            }
            return { platformAccountId: igUser.id };
        }
    }
}
// ---------------------------------------------------------------------------
// Token refresh helpers
// ---------------------------------------------------------------------------
/**
 * Returns true if the token expires within 24 hours from now, or is already expired.
 */
function shouldRefreshToken(tokenExpiresAt) {
    if (!tokenExpiresAt)
        return false;
    const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tokenExpiresAt <= twentyFourHoursFromNow;
}
/**
 * Stub: notify the user that their platform connection has become invalid.
 * Real notification (email/webhook) will be implemented in a later task.
 */
function notifyUserOfInvalidConnection(userId, platform) {
    console.error(`[SMAS] Platform connection invalidated — userId=${userId} platform=${platform}. User notification pending implementation.`);
}
// ---------------------------------------------------------------------------
// Platform-specific: refresh access token
// ---------------------------------------------------------------------------
async function refreshPlatformToken(platform, refreshToken) {
    switch (platform) {
        case 'twitter': {
            const credentials = Buffer.from(`${config_1.config.TWITTER_CLIENT_ID}:${config_1.config.TWITTER_CLIENT_SECRET}`).toString('base64');
            const { data } = await axios_1.default.post('https://api.twitter.com/2/oauth2/token', new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${credentials}`,
                },
            });
            return data;
        }
        case 'linkedin': {
            const { data } = await axios_1.default.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: config_1.config.LINKEDIN_CLIENT_ID,
                client_secret: config_1.config.LINKEDIN_CLIENT_SECRET,
            }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            return data;
        }
        case 'facebook': {
            const { data } = await axios_1.default.get('https://graph.facebook.com/v19.0/oauth/access_token', {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: config_1.config.FACEBOOK_APP_ID,
                    client_secret: config_1.config.FACEBOOK_APP_SECRET,
                    fb_exchange_token: refreshToken,
                },
            });
            return data;
        }
        case 'instagram': {
            const { data } = await axios_1.default.get('https://graph.instagram.com/refresh_access_token', {
                params: {
                    grant_type: 'ig_refresh_token',
                    access_token: refreshToken,
                },
            });
            return data;
        }
    }
}
// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
async function oauthRoutes(app, prisma) {
    // GET /auth/oauth/:platform/start
    app.get('/auth/oauth/:platform/start', { preHandler: (0, rbac_1.requireAuth)() }, async (request, reply) => {
        const { platform } = request.params;
        if (!isValidPlatform(platform)) {
            return reply.status(400).send({ error: 'unsupported_platform' });
        }
        const userId = request.user.id;
        const state = crypto_1.default.randomBytes(32).toString('hex');
        const redis = (0, smas_shared_1.getRedisClient)(config_1.config.REDIS_URL);
        await redis.set(`oauth_state:${state}`, userId, 'EX', OAUTH_STATE_TTL);
        const authUrl = buildAuthorizationUrl(platform, state);
        return reply.redirect(authUrl);
    });
    // GET /auth/oauth/:platform/callback
    app.get('/auth/oauth/:platform/callback', async (request, reply) => {
        const { platform } = request.params;
        const { code, state, error: oauthError } = request.query;
        if (!isValidPlatform(platform)) {
            return reply.status(400).send({ error: 'unsupported_platform' });
        }
        // Handle platform-side errors (e.g. user denied access)
        if (oauthError) {
            return reply.status(400).send({ error: oauthError });
        }
        if (!code || !state) {
            return reply.status(400).send({ error: 'invalid_oauth_state' });
        }
        // Validate state from Redis
        const redis = (0, smas_shared_1.getRedisClient)(config_1.config.REDIS_URL);
        const userId = await redis.get(`oauth_state:${state}`);
        if (!userId) {
            return reply.status(400).send({ error: 'invalid_oauth_state' });
        }
        await redis.del(`oauth_state:${state}`);
        // Exchange code for tokens
        let tokens;
        try {
            tokens = await exchangeCodeForTokens(platform, code);
        }
        catch {
            return reply.status(502).send({ error: 'token_exchange_failed' });
        }
        // Fetch account info and validate account type
        let accountInfo;
        try {
            accountInfo = await fetchAndValidateAccount(platform, tokens.access_token);
        }
        catch (err) {
            const code = err.code;
            if (code === 'instagram_business_required') {
                return reply.status(400).send({ error: 'instagram_business_required' });
            }
            if (code === 'linkedin_company_page_required') {
                return reply.status(400).send({ error: 'linkedin_company_page_required' });
            }
            return reply.status(502).send({ error: 'account_info_fetch_failed' });
        }
        // Encrypt tokens before storing
        const encryptedAccessToken = (0, crypto_2.encrypt)(tokens.access_token, config_1.config.ENCRYPTION_KEY);
        const encryptedRefreshToken = tokens.refresh_token
            ? (0, crypto_2.encrypt)(tokens.refresh_token, config_1.config.ENCRYPTION_KEY)
            : null;
        const tokenExpiresAt = tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : null;
        // Upsert platform connection
        await prisma.platformConnection.upsert({
            where: {
                userId_platform_platformAccountId: {
                    userId,
                    platform: platform,
                    platformAccountId: accountInfo.platformAccountId,
                },
            },
            create: {
                userId,
                platform: platform,
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                tokenExpiresAt,
                platformAccountId: accountInfo.platformAccountId,
                status: 'active',
            },
            update: {
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                tokenExpiresAt,
                status: 'active',
            },
        });
        return reply.redirect(config_1.config.FRONTEND_URL);
    });
    // POST /auth/oauth/:platform/refresh
    app.post('/auth/oauth/:platform/refresh', { preHandler: (0, rbac_1.requireAuth)() }, async (request, reply) => {
        const { platform } = request.params;
        if (!isValidPlatform(platform)) {
            return reply.status(400).send({ error: 'unsupported_platform' });
        }
        const userId = request.user.id;
        // Find the active platform connection for this user + platform
        const connection = await prisma.platformConnection.findFirst({
            where: { userId, platform: platform, status: 'active' },
        });
        if (!connection) {
            return reply.status(404).send({ error: 'platform_connection_not_found' });
        }
        // Decrypt the stored refresh token
        if (!connection.refreshToken) {
            return reply.status(400).send({ error: 'no_refresh_token' });
        }
        let decryptedRefreshToken;
        try {
            decryptedRefreshToken = (0, crypto_2.decrypt)(connection.refreshToken, config_1.config.ENCRYPTION_KEY);
        }
        catch {
            return reply.status(400).send({ error: 'no_refresh_token' });
        }
        // Call the platform's token refresh endpoint
        let tokens;
        try {
            tokens = await refreshPlatformToken(platform, decryptedRefreshToken);
        }
        catch (err) {
            console.error(`[SMAS] Token refresh failed — userId=${userId} platform=${platform}`, err);
            // Mark connection as invalid and notify user
            await prisma.platformConnection.update({
                where: { id: connection.id },
                data: { status: 'invalid' },
            });
            notifyUserOfInvalidConnection(userId, platform);
            return reply.status(502).send({ error: 'platform_token_refresh_failed' });
        }
        // Encrypt new tokens and update the connection
        const encryptedAccessToken = (0, crypto_2.encrypt)(tokens.access_token, config_1.config.ENCRYPTION_KEY);
        const encryptedRefreshToken = tokens.refresh_token
            ? (0, crypto_2.encrypt)(tokens.refresh_token, config_1.config.ENCRYPTION_KEY)
            : connection.refreshToken; // keep existing if platform didn't rotate it
        const tokenExpiresAt = tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : connection.tokenExpiresAt;
        await prisma.platformConnection.update({
            where: { id: connection.id },
            data: {
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                tokenExpiresAt,
                status: 'active',
            },
        });
        return reply.status(200).send({ message: 'token_refreshed' });
    });
}
//# sourceMappingURL=oauth.js.map