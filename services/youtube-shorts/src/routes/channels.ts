import { Router, Request, Response } from 'express';
import { PrismaClient } from 'smas-shared';
import { requireAuth } from '../middleware/auth';
import { generateAuthUrl, exchangeCode } from '../lib/youtubeUploader';
import { google } from 'googleapis';
import { config } from '../config';
import { decrypt } from '../lib/crypto';

const router = Router();
const prisma = new PrismaClient();

function getEncryptionKey(): Buffer {
  return Buffer.from(config.ENCRYPTION_KEY, 'hex');
}

/**
 * POST /api/youtube-shorts/channels/connect
 * Returns a Google OAuth2 authorization URL.
 * Requirements: 1.1
 */
router.post('/connect', requireAuth, (_req: Request, res: Response): void => {
  const url = generateAuthUrl();
  res.json({ url });
});

/**
 * GET /api/youtube-shorts/channels/callback
 * Exchanges the OAuth2 code for tokens and stores the channel.
 * Requirements: 1.2, 1.3, 1.7
 */
router.get('/callback', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { code, error } = req.query;

  // Requirement 1.3: error param → HTTP 400
  if (error) {
    res.status(400).json({ error: 'oauth_error', detail: String(error) });
    return;
  }

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'missing_code' });
    return;
  }

  try {
    const channel = await exchangeCode(code, req.userId);
    res.status(201).json({
      id: channel.id,
      channelTitle: channel.channelTitle,
      thumbnailUrl: channel.thumbnailUrl,
      quotaUsed: channel.quotaUsed,
    });
  } catch (err: unknown) {
    // Requirement 1.7: duplicate connection → HTTP 409
    if (
      err instanceof Error &&
      err.message.includes('Unique constraint') ||
      (err as { code?: string }).code === 'P2002'
    ) {
      res.status(409).json({ error: 'channel_already_connected' });
      return;
    }
    console.error(JSON.stringify({
      service: 'youtube-shorts',
      level: 'error',
      message: 'OAuth callback error',
      timestamp: new Date().toISOString(),
      detail: err instanceof Error ? err.message : String(err),
    }));
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /api/youtube-shorts/channels
 * Lists all connected channels for the authenticated user.
 * Requirements: 1.5, 11.1
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const channels = await prisma.youTubeChannel.findMany({
    where: { userId: req.userId },
    select: {
      id: true,
      channelTitle: true,
      thumbnailUrl: true,
      quotaUsed: true,
      quotaResetAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ channels });
});

/**
 * DELETE /api/youtube-shorts/channels/:channelId
 * Revokes OAuth tokens and deletes the channel record.
 * Requirements: 1.4, 11.1, 11.4
 */
router.delete('/:channelId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { channelId } = req.params;

  // Scope to the authenticated user (req 11.1, 11.4)
  const channel = await prisma.youTubeChannel.findFirst({
    where: { id: channelId, userId: req.userId },
  });

  if (!channel) {
    // Return 404 to avoid confirming resource existence (req 11.4)
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // Attempt to revoke the access token
  try {
    const key = getEncryptionKey();
    const accessToken = decrypt(JSON.parse(channel.accessTokenEnc), key);

    const oauth2Client = new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    await oauth2Client.revokeCredentials();
  } catch {
    // Log but don't block deletion if revocation fails
    console.warn(JSON.stringify({
      service: 'youtube-shorts',
      level: 'warn',
      message: 'Token revocation failed; proceeding with deletion',
      timestamp: new Date().toISOString(),
    }));
  }

  await prisma.youTubeChannel.delete({ where: { id: channelId } });

  res.status(204).send();
});

export default router;
