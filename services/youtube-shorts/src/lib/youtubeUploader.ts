import { google } from 'googleapis';
import { Worker, Job } from 'bullmq';
import AWS from 'aws-sdk';
import { PrismaClient } from 'smas-shared';
import type { YouTubeChannel } from '@prisma/client';
import { config } from '../config';
import { encrypt, decrypt } from './crypto';
import { emitToUser } from './socketGateway';

const prisma = new PrismaClient();

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

/** 5 minutes in milliseconds */
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** YouTube Data API v3 default daily quota units */
const DAILY_QUOTA_LIMIT = 10_000;

/** Retry backoff delays in ms: 30 s, 60 s, 120 s */
const RETRY_DELAYS = [30_000, 60_000, 120_000];

/** Minimum interval between upload_progress events (10 seconds) */
const PROGRESS_INTERVAL_MS = 10_000;

function getEncryptionKey(): Buffer {
  return Buffer.from(config.ENCRYPTION_KEY, 'hex');
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
}

function createS3Client(): AWS.S3 {
  return new AWS.S3({
    endpoint: config.S3_ENDPOINT || undefined,
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
    s3ForcePathStyle: !!config.S3_ENDPOINT,
  });
}

function isQuotaError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as { errors?: Array<{ reason?: string }> };
    const reason = e.errors?.[0]?.reason;
    return reason === 'quotaExceeded' || reason === 'dailyLimitExceeded';
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a Google OAuth2 authorization URL scoped to youtube.upload and youtube.readonly.
 * Requirements: 1.1
 */
export function generateAuthUrl(): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/**
 * Exchange an authorization code for tokens, fetch channel info, encrypt and persist
 * a YouTubeChannel record for the given userId.
 * Requirements: 1.2, 1.3
 */
export async function exchangeCode(code: string, userId: string): Promise<YouTubeChannel> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Missing tokens in OAuth2 response');
  }

  oauth2Client.setCredentials(tokens);

  // Fetch channel info from YouTube Data API
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const channelRes = await youtube.channels.list({
    part: ['snippet'],
    mine: true,
  });

  const channelItem = channelRes.data.items?.[0];
  if (!channelItem) {
    throw new Error('No YouTube channel found for this Google account');
  }

  const googleAccountId = channelItem.id!;
  const channelTitle = channelItem.snippet?.title ?? '';
  const thumbnailUrl = channelItem.snippet?.thumbnails?.default?.url ?? null;

  const key = getEncryptionKey();
  const accessTokenEnc = JSON.stringify(encrypt(tokens.access_token, key));
  const refreshTokenEnc = JSON.stringify(encrypt(tokens.refresh_token, key));

  const tokenExpiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  // Quota resets at midnight UTC
  const quotaResetAt = new Date();
  quotaResetAt.setUTCHours(24, 0, 0, 0);

  const channel = await prisma.youTubeChannel.create({
    data: {
      userId,
      googleAccountId,
      channelTitle,
      thumbnailUrl,
      accessTokenEnc,
      refreshTokenEnc,
      tokenExpiresAt,
      quotaResetAt,
    },
  });

  return channel;
}

/**
 * Refresh the access token if it is within 5 minutes of expiry.
 * Re-encrypts and persists the updated tokens.
 * Requirements: 1.2, 8.6
 */
export async function refreshTokenIfNeeded(channel: YouTubeChannel): Promise<YouTubeChannel> {
  const now = Date.now();
  const expiresAt = channel.tokenExpiresAt.getTime();

  if (expiresAt - now > FIVE_MINUTES_MS) {
    // Token is still valid — no refresh needed
    return channel;
  }

  const key = getEncryptionKey();
  const refreshToken = decrypt(JSON.parse(channel.refreshTokenEnc), key);

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  const accessTokenEnc = JSON.stringify(encrypt(credentials.access_token, key));
  const tokenExpiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  const updated = await prisma.youTubeChannel.update({
    where: { id: channel.id },
    data: { accessTokenEnc, tokenExpiresAt },
  });

  return updated;
}

/**
 * Build an authenticated OAuth2 client for a channel (refreshing if needed).
 * Used by upload logic.
 */
export async function getAuthenticatedClient(channel: YouTubeChannel) {
  const refreshed = await refreshTokenIfNeeded(channel);
  const key = getEncryptionKey();
  const accessToken = decrypt(JSON.parse(refreshed.accessTokenEnc), key);
  const refreshToken = decrypt(JSON.parse(refreshed.refreshTokenEnc), key);

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return { oauth2Client, channel: refreshed };
}

// ─── Upload Worker (Task 13) ──────────────────────────────────────────────────

/**
 * Core upload logic: streams clip from S3 to YouTube, emits progress events,
 * updates DB on success/failure.
 * Requirements: 1.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
async function uploadClip(clipId: string): Promise<void> {
  // 1. Fetch ShortClip with variants and job.channel
  const clip = await prisma.shortClip.findUniqueOrThrow({
    where: { id: clipId },
    include: {
      variants: true,
      job: {
        include: { channel: true },
      },
    },
  });

  const channel = clip.job.channel;
  if (!channel) {
    throw new Error(`No YouTubeChannel associated with job ${clip.jobId}`);
  }

  // 2. Get first ClipVariant for S3 key
  const variant = clip.variants[0];
  if (!variant) {
    throw new Error(`No ClipVariant found for clip ${clipId}`);
  }

  // 3. Get authenticated OAuth2 client (refreshes token if within 5 min of expiry — req 8.6)
  const { oauth2Client, channel: refreshedChannel } = await getAuthenticatedClient(channel);

  // 4. Stream clip from S3
  const s3 = createS3Client();
  const s3Stream = s3
    .getObject({ Bucket: config.S3_BUCKET, Key: variant.s3Key })
    .createReadStream();

  // 5. Upload to YouTube Data API v3 (req 8.1)
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  let lastProgressEmit = 0;

  const response = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: clip.title,
          description: `${clip.description}\n\n#Shorts`,
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus: 'public',
        },
      },
      media: {
        body: s3Stream,
      },
    },
    {
      onUploadProgress: (evt: { bytesRead: number }) => {
        const now = Date.now();
        // Emit at minimum every 10 seconds (req 8.2)
        if (now - lastProgressEmit >= PROGRESS_INTERVAL_MS) {
          lastProgressEmit = now;
          emitToUser(clip.userId, 'clip:upload_progress', {
            clipId,
            bytesUploaded: evt.bytesRead,
            totalBytes: Number(variant.fileSizeBytes),
          });
        }
      },
    },
  );

  const videoId = response.data.id!;
  const youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;

  // 6. Update ShortClip on success (req 8.3)
  await prisma.shortClip.update({
    where: { id: clipId },
    data: {
      youtubeVideoId: videoId,
      youtubeUrl,
      status: 'uploaded',
      errorReason: null,
    },
  });

  emitToUser(clip.userId, 'clip:uploaded', { clipId, youtubeVideoId: videoId, youtubeUrl });

  // 7. Quota warning check: after upload, check if quota >= 90% of daily limit (req 1.6)
  const updatedChannel = await prisma.youTubeChannel.findUnique({
    where: { id: refreshedChannel.id },
  });
  if (updatedChannel && updatedChannel.quotaUsed >= DAILY_QUOTA_LIMIT * 0.9) {
    emitToUser(clip.userId, 'channel:quota_warning', {
      channelId: updatedChannel.id,
      quotaUsed: updatedChannel.quotaUsed,
      quotaLimit: DAILY_QUOTA_LIMIT,
    });
  }
}

/**
 * BullMQ worker that consumes `yt-clip-uploads` queue.
 * Handles quota exceeded (no retry) and other failures (retry up to 3 times with backoff).
 * Requirements: 8.1–8.6, 1.6
 */
export function startYouTubeUploaderWorker(): Worker {
  const connection = { url: config.REDIS_URL };

  const worker = new Worker(
    'yt-clip-uploads',
    async (job: Job<{ clipId: string }>) => {
      const { clipId } = job.data;
      const attemptNumber = job.attemptsMade; // 0-indexed

      // Set status to uploading on first attempt
      if (attemptNumber === 0) {
        await prisma.shortClip.update({
          where: { id: clipId },
          data: { status: 'uploading' },
        });
      }

      try {
        await uploadClip(clipId);
      } catch (err: unknown) {
        if (isQuotaError(err)) {
          // Quota exceeded — do not retry (req 8.4)
          const clip = await prisma.shortClip.findUnique({
            where: { id: clipId },
            include: { job: { include: { channel: true } } },
          });

          await prisma.shortClip.update({
            where: { id: clipId },
            data: { status: 'upload_failed', errorReason: 'quota_exceeded' },
          });

          if (clip?.userId) {
            emitToUser(clip.userId, 'channel:quota_warning', {
              channelId: clip.job.channelId,
              quotaUsed: clip.job.channel?.quotaUsed ?? 0,
              quotaLimit: DAILY_QUOTA_LIMIT,
            });
          }

          // Do not rethrow — prevents BullMQ from retrying
          return;
        }

        // Non-quota failure — retry up to 3 times with backoff (req 8.5)
        if (attemptNumber < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attemptNumber]!;
          await sleep(delay);
          throw err; // rethrow so BullMQ retries
        }

        // Exhausted retries — mark as upload_failed
        await prisma.shortClip.update({
          where: { id: clipId },
          data: {
            status: 'upload_failed',
            errorReason: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
    { connection },
  );

  return worker;
}
