import { FastifyInstance } from 'fastify';
import { PrismaClient, Platform } from 'smas-shared';
import { getRedisClient } from 'smas-shared';
import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config';
import { requireAuth } from '../middleware/rbac';
import { encrypt, decrypt } from '../utils/crypto';

const SUPPORTED_PLATFORMS = ['twitter', 'linkedin', 'facebook', 'instagram'] as const;
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

const OAUTH_STATE_TTL = 600; // 10 minutes in seconds

function isValidPlatform(p: string): p is SupportedPlatform {
  return (SUPPORTED_PLATFORMS as readonly string[]).includes(p);
}

// ---------------------------------------------------------------------------
// Platform-specific: build authorization URL
// ---------------------------------------------------------------------------

function buildAuthorizationUrl(platform: SupportedPlatform, state: string): string {
  switch (platform) {
    case 'twitter': {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.TWITTER_CLIENT_ID,
        redirect_uri: config.TWITTER_REDIRECT_URI,
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
        client_id: config.LINKEDIN_CLIENT_ID,
        redirect_uri: config.LINKEDIN_REDIRECT_URI,
        scope: 'r_organization_social w_organization_social r_basicprofile',
        state,
      });
      return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
    }
    case 'facebook': {
      const params = new URLSearchParams({
        client_id: config.FACEBOOK_APP_ID,
        redirect_uri: config.FACEBOOK_REDIRECT_URI,
        scope: 'pages_manage_posts,pages_read_engagement',
        state,
        response_type: 'code',
      });
      return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
    }
    case 'instagram': {
      const params = new URLSearchParams({
        client_id: config.INSTAGRAM_APP_ID,
        redirect_uri: config.INSTAGRAM_REDIRECT_URI,
        scope: 'instagram_basic,instagram_content_publish,instagram_manage_insights',
        state,
        response_type: 'code',
      });
      return `https://api.instagram.com/oauth/authorize?${params}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Platform-specific: exchange code for tokens
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function exchangeCodeForTokens(
  platform: SupportedPlatform,
  code: string,
): Promise<TokenResponse> {
  switch (platform) {
    case 'twitter': {
      const credentials = Buffer.from(
        `${config.TWITTER_CLIENT_ID}:${config.TWITTER_CLIENT_SECRET}`,
      ).toString('base64');
      const { data } = await axios.post<TokenResponse>(
        'https://api.twitter.com/2/oauth2/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.TWITTER_REDIRECT_URI,
          code_verifier: 'challenge',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
          },
        },
      );
      return data;
    }
    case 'linkedin': {
      const { data } = await axios.post<TokenResponse>(
        'https://www.linkedin.com/oauth/v2/accessToken',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.LINKEDIN_REDIRECT_URI,
          client_id: config.LINKEDIN_CLIENT_ID,
          client_secret: config.LINKEDIN_CLIENT_SECRET,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return data;
    }
    case 'facebook': {
      const { data } = await axios.get<TokenResponse>(
        'https://graph.facebook.com/v19.0/oauth/access_token',
        {
          params: {
            client_id: config.FACEBOOK_APP_ID,
            client_secret: config.FACEBOOK_APP_SECRET,
            redirect_uri: config.FACEBOOK_REDIRECT_URI,
            code,
          },
        },
      );
      return data;
    }
    case 'instagram': {
      const form = new URLSearchParams({
        client_id: config.INSTAGRAM_APP_ID,
        client_secret: config.INSTAGRAM_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: config.INSTAGRAM_REDIRECT_URI,
        code,
      });
      const { data } = await axios.post<{ access_token: string; user_id: number }>(
        'https://api.instagram.com/oauth/access_token',
        form,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return { access_token: data.access_token };
    }
  }
}

// ---------------------------------------------------------------------------
// Platform-specific: fetch account ID and validate account type
// ---------------------------------------------------------------------------

interface AccountInfo {
  platformAccountId: string;
}

async function fetchAndValidateAccount(
  platform: SupportedPlatform,
  accessToken: string,
): Promise<AccountInfo> {
  switch (platform) {
    case 'twitter': {
      const { data } = await axios.get<{ data: { id: string } }>(
        'https://api.twitter.com/2/users/me',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return { platformAccountId: data.data.id };
    }
    case 'linkedin': {
      // Fetch the authenticated member's profile to get their URN
      const { data: profile } = await axios.get<{ id: string }>(
        'https://api.linkedin.com/v2/me',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      // Verify the user has access to at least one organization (Company Page)
      const { data: orgs } = await axios.get<{ elements: unknown[] }>(
        'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!orgs.elements || orgs.elements.length === 0) {
        const err = new Error('linkedin_company_page_required') as Error & { code: string };
        err.code = 'linkedin_company_page_required';
        throw err;
      }
      return { platformAccountId: profile.id };
    }
    case 'facebook': {
      const { data } = await axios.get<{ id: string }>(
        'https://graph.facebook.com/v19.0/me',
        {
          params: { access_token: accessToken, fields: 'id' },
        },
      );
      return { platformAccountId: data.id };
    }
    case 'instagram': {
      // Fetch the Instagram user info
      const { data: igUser } = await axios.get<{ id: string; account_type?: string }>(
        'https://graph.instagram.com/me',
        {
          params: { access_token: accessToken, fields: 'id,account_type' },
        },
      );
      // Only Business accounts are supported
      if (igUser.account_type !== 'BUSINESS') {
        const err = new Error('instagram_business_required') as Error & { code: string };
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
export function shouldRefreshToken(tokenExpiresAt: Date | null): boolean {
  if (!tokenExpiresAt) return false;
  const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return tokenExpiresAt <= twentyFourHoursFromNow;
}

/**
 * Stub: notify the user that their platform connection has become invalid.
 * Real notification (email/webhook) will be implemented in a later task.
 */
export function notifyUserOfInvalidConnection(userId: string, platform: string): void {
  console.error(
    `[SMAS] Platform connection invalidated — userId=${userId} platform=${platform}. User notification pending implementation.`,
  );
}

// ---------------------------------------------------------------------------
// Platform-specific: refresh access token
// ---------------------------------------------------------------------------

async function refreshPlatformToken(
  platform: SupportedPlatform,
  refreshToken: string,
): Promise<TokenResponse> {
  switch (platform) {
    case 'twitter': {
      const credentials = Buffer.from(
        `${config.TWITTER_CLIENT_ID}:${config.TWITTER_CLIENT_SECRET}`,
      ).toString('base64');
      const { data } = await axios.post<TokenResponse>(
        'https://api.twitter.com/2/oauth2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
          },
        },
      );
      return data;
    }
    case 'linkedin': {
      const { data } = await axios.post<TokenResponse>(
        'https://www.linkedin.com/oauth/v2/accessToken',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: config.LINKEDIN_CLIENT_ID,
          client_secret: config.LINKEDIN_CLIENT_SECRET,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return data;
    }
    case 'facebook': {
      const { data } = await axios.get<TokenResponse>(
        'https://graph.facebook.com/v19.0/oauth/access_token',
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: config.FACEBOOK_APP_ID,
            client_secret: config.FACEBOOK_APP_SECRET,
            fb_exchange_token: refreshToken,
          },
        },
      );
      return data;
    }
    case 'instagram': {
      const { data } = await axios.get<TokenResponse>(
        'https://graph.instagram.com/refresh_access_token',
        {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: refreshToken,
          },
        },
      );
      return data;
    }
  }
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function oauthRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {
  // GET /auth/oauth/:platform/start
  app.get<{ Params: { platform: string } }>(
    '/auth/oauth/:platform/start',
    { preHandler: requireAuth() },
    async (request, reply) => {
      const { platform } = request.params;

      if (!isValidPlatform(platform)) {
        return reply.status(400).send({ error: 'unsupported_platform' });
      }

      const userId = request.user!.id;
      const state = crypto.randomBytes(32).toString('hex');

      const redis = getRedisClient(config.REDIS_URL);
      await redis.set(`oauth_state:${state}`, userId, 'EX', OAUTH_STATE_TTL);

      const authUrl = buildAuthorizationUrl(platform, state);
      return reply.redirect(authUrl);
    },
  );

  // GET /auth/oauth/:platform/callback
  app.get<{
    Params: { platform: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>(
    '/auth/oauth/:platform/callback',
    async (request, reply) => {
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
      const redis = getRedisClient(config.REDIS_URL);
      const userId = await redis.get(`oauth_state:${state}`);
      if (!userId) {
        return reply.status(400).send({ error: 'invalid_oauth_state' });
      }
      await redis.del(`oauth_state:${state}`);

      // Exchange code for tokens
      let tokens: TokenResponse;
      try {
        tokens = await exchangeCodeForTokens(platform, code);
      } catch {
        return reply.status(502).send({ error: 'token_exchange_failed' });
      }

      // Fetch account info and validate account type
      let accountInfo: AccountInfo;
      try {
        accountInfo = await fetchAndValidateAccount(platform, tokens.access_token);
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === 'instagram_business_required') {
          return reply.status(400).send({ error: 'instagram_business_required' });
        }
        if (code === 'linkedin_company_page_required') {
          return reply.status(400).send({ error: 'linkedin_company_page_required' });
        }
        return reply.status(502).send({ error: 'account_info_fetch_failed' });
      }

      // Encrypt tokens before storing
      const encryptedAccessToken = encrypt(tokens.access_token, config.ENCRYPTION_KEY);
      const encryptedRefreshToken = tokens.refresh_token
        ? encrypt(tokens.refresh_token, config.ENCRYPTION_KEY)
        : null;

      const tokenExpiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      // Upsert platform connection
      await prisma.platformConnection.upsert({
        where: {
          userId_platform_platformAccountId: {
            userId,
            platform: platform as Platform,
            platformAccountId: accountInfo.platformAccountId,
          },
        },
        create: {
          userId,
          platform: platform as Platform,
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

      return reply.redirect(config.FRONTEND_URL);
    },
  );

  // POST /auth/oauth/:platform/refresh
  app.post<{ Params: { platform: string } }>(
    '/auth/oauth/:platform/refresh',
    { preHandler: requireAuth() },
    async (request, reply) => {
      const { platform } = request.params;

      if (!isValidPlatform(platform)) {
        return reply.status(400).send({ error: 'unsupported_platform' });
      }

      const userId = request.user!.id;

      // Find the active platform connection for this user + platform
      const connection = await prisma.platformConnection.findFirst({
        where: { userId, platform: platform as Platform, status: 'active' },
      });

      if (!connection) {
        return reply.status(404).send({ error: 'platform_connection_not_found' });
      }

      // Decrypt the stored refresh token
      if (!connection.refreshToken) {
        return reply.status(400).send({ error: 'no_refresh_token' });
      }

      let decryptedRefreshToken: string;
      try {
        decryptedRefreshToken = decrypt(connection.refreshToken, config.ENCRYPTION_KEY);
      } catch {
        return reply.status(400).send({ error: 'no_refresh_token' });
      }

      // Call the platform's token refresh endpoint
      let tokens: TokenResponse;
      try {
        tokens = await refreshPlatformToken(platform, decryptedRefreshToken);
      } catch (err) {
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
      const encryptedAccessToken = encrypt(tokens.access_token, config.ENCRYPTION_KEY);
      const encryptedRefreshToken = tokens.refresh_token
        ? encrypt(tokens.refresh_token, config.ENCRYPTION_KEY)
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
    },
  );
}
