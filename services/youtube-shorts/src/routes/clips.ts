import { Router, Request, Response } from 'express';
import { PrismaClient } from 'smas-shared';
import AWS from 'aws-sdk';
import { requireAuth } from '../middleware/auth';
import { enqueueClipUpload } from '../lib/queue';
import { config } from '../config';

const router = Router();
const prisma = new PrismaClient();

function getS3Client(): AWS.S3 {
  return new AWS.S3({
    endpoint: config.S3_ENDPOINT || undefined,
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
    s3ForcePathStyle: !!config.S3_ENDPOINT,
    signatureVersion: 'v4',
  });
}

/**
 * GET /api/youtube-shorts/clips/:clipId
 * Return clip with variants; HTTP 404 on cross-user access.
 * Requirements: 7.1, 7.2, 11.1, 11.4
 */
router.get('/:clipId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { clipId } = req.params;

  const clip = await prisma.shortClip.findFirst({
    where: { id: clipId, userId: req.userId },
    include: {
      variants: {
        select: {
          id: true,
          s3Key: true,
          resolution: true,
          durationSec: true,
          fileSizeBytes: true,
          createdAt: true,
        },
      },
    },
  });

  // Requirement 11.4: return 404 for cross-user or missing clip
  if (!clip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json({ clip });
});

/**
 * PATCH /api/youtube-shorts/clips/:clipId
 * Update title and/or description; validate length constraints.
 * Requirements: 7.2, 7.3, 7.4, 11.1, 11.4
 */
router.patch('/:clipId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { clipId } = req.params;
  const { title, description } = req.body as { title?: string; description?: string };

  // Requirement 7.3: title > 100 chars → HTTP 422
  if (title !== undefined && title.length > 100) {
    res.status(422).json({ error: 'title_too_long', max: 100 });
    return;
  }

  // Requirement 7.4: description > 5000 chars → HTTP 422
  if (description !== undefined && description.length > 5000) {
    res.status(422).json({ error: 'description_too_long', max: 5000 });
    return;
  }

  // Scope to authenticated user (req 11.1, 11.4)
  const existing = await prisma.shortClip.findFirst({
    where: { id: clipId, userId: req.userId },
    select: { id: true },
  });

  if (!existing) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const updateData: { title?: string; description?: string } = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;

  const updated = await prisma.shortClip.update({
    where: { id: clipId },
    data: updateData,
    include: {
      variants: {
        select: {
          id: true,
          s3Key: true,
          resolution: true,
          durationSec: true,
          fileSizeBytes: true,
          createdAt: true,
        },
      },
    },
  });

  res.json({ clip: updated });
});

/**
 * GET /api/youtube-shorts/clips/:clipId/download
 * Generate a pre-signed S3 URL valid for 1 hour.
 * Requirements: 7.6, 11.1, 11.4
 */
router.get('/:clipId/download', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { clipId } = req.params;

  const clip = await prisma.shortClip.findFirst({
    where: { id: clipId, userId: req.userId },
    select: {
      id: true,
      variants: {
        select: { s3Key: true },
        take: 1,
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  // Requirement 11.4: 404 for cross-user or missing
  if (!clip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  if (clip.variants.length === 0) {
    res.status(404).json({ error: 'clip_not_rendered' });
    return;
  }

  const s3Key = clip.variants[0].s3Key;
  const s3 = getS3Client();

  // Requirement 7.6: pre-signed URL valid for 1 hour (3600 seconds)
  const url = s3.getSignedUrl('getObject', {
    Bucket: config.S3_BUCKET,
    Key: s3Key,
    Expires: 3600,
  });

  res.json({ url });
});

/**
 * POST /api/youtube-shorts/clips/:clipId/upload
 * Enqueue clip for YouTube upload; HTTP 404 with clip_not_rendered if no ClipVariant exists.
 * Requirements: 8.7, 11.1, 11.4
 */
router.post('/:clipId/upload', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { clipId } = req.params;

  const clip = await prisma.shortClip.findFirst({
    where: { id: clipId, userId: req.userId },
    select: {
      id: true,
      variants: { select: { id: true }, take: 1 },
    },
  });

  // Requirement 11.4: 404 for cross-user or missing
  if (!clip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // Requirement 8.7: no ClipVariant → HTTP 404 with clip_not_rendered
  if (clip.variants.length === 0) {
    res.status(404).json({ error: 'clip_not_rendered' });
    return;
  }

  // Update clip status to uploading and enqueue
  await prisma.shortClip.update({
    where: { id: clipId },
    data: { status: 'uploading' },
  });

  enqueueClipUpload(clipId).catch((err: unknown) => {
    console.error(JSON.stringify({
      service: 'youtube-shorts',
      level: 'error',
      message: 'Failed to enqueue clip upload',
      timestamp: new Date().toISOString(),
      clipId,
      detail: err instanceof Error ? err.message : String(err),
    }));
  });

  res.json({ clipId, status: 'uploading' });
});

/**
 * POST /api/youtube-shorts/clips/:clipId/regenerate
 * Re-enqueue clip for re-render; set status to processing.
 * Requirements: 7.5, 11.1, 11.4
 */
router.post('/:clipId/regenerate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { clipId } = req.params;

  const clip = await prisma.shortClip.findFirst({
    where: { id: clipId, userId: req.userId },
    select: { id: true, jobId: true },
  });

  // Requirement 11.4: 404 for cross-user or missing
  if (!clip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // Requirement 7.5: update status to processing; worker will pick it up
  await prisma.shortClip.update({
    where: { id: clipId },
    data: { status: 'processing', errorReason: null },
  });

  res.json({ clipId, status: 'processing' });
});

export default router;
