import { Router, Request, Response } from 'express';
import { PrismaClient } from 'smas-shared';
import AWS from 'aws-sdk';
import { requireAuth } from '../middleware/auth';
import { enqueueVideoJob } from '../lib/queue';
import { emitToUser } from '../lib/socketGateway';
import { config } from '../config';

const router = Router();
const prisma = new PrismaClient();

// YouTube URL validation pattern (req 2.2)
const YOUTUBE_URL_PATTERN = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)[\w-]+/;

function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_PATTERN.test(url);
}

function getS3Client(): AWS.S3 {
  return new AWS.S3({
    endpoint: config.S3_ENDPOINT || undefined,
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
    s3ForcePathStyle: !!config.S3_ENDPOINT,
  });
}

/**
 * POST /api/youtube-shorts/jobs
 * Submit a new video job for processing.
 * Requirements: 2.1, 2.2, 2.4, 2.5, 11.1
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { youtubeUrl, config: jobConfig } = req.body as {
    youtubeUrl?: string;
    config?: {
      maxClips?: number;
      minClipDuration?: number;
      maxClipDuration?: number;
      burnCaptions?: boolean;
      channelId?: string;
    };
  };

  // Requirement 2.2: validate YouTube URL pattern
  if (!youtubeUrl || !isValidYouTubeUrl(youtubeUrl)) {
    res.status(422).json({ error: 'invalid_youtube_url' });
    return;
  }

  // Requirement 2.5: validate maxClips range 1–10
  const maxClips = jobConfig?.maxClips ?? 5;
  if (maxClips < 1 || maxClips > 10) {
    res.status(422).json({ error: 'invalid_clip_count', min: 1, max: 10 });
    return;
  }

  const minClipDuration = jobConfig?.minClipDuration ?? 30;
  const maxClipDuration = jobConfig?.maxClipDuration ?? 60;
  const burnCaptions = jobConfig?.burnCaptions ?? false;
  const channelId = jobConfig?.channelId ?? null;

  // Requirement 2.1: create VideoJob with status pending and enqueue
  const job = await prisma.videoJob.create({
    data: {
      userId: req.userId,
      youtubeUrl,
      status: 'pending',
      maxClips,
      minClipDuration,
      maxClipDuration,
      burnCaptions,
      channelId,
    },
    select: {
      id: true,
      status: true,
      youtubeUrl: true,
      maxClips: true,
      minClipDuration: true,
      maxClipDuration: true,
      burnCaptions: true,
      channelId: true,
      createdAt: true,
    },
  });

  // Enqueue asynchronously — must return within 2 s (req 2.1)
  enqueueVideoJob(job.id).catch((err: unknown) => {
    console.error(JSON.stringify({
      service: 'youtube-shorts',
      level: 'error',
      message: 'Failed to enqueue video job',
      timestamp: new Date().toISOString(),
      jobId: job.id,
      detail: err instanceof Error ? err.message : String(err),
    }));
  });

  res.status(201).json({ jobId: job.id, status: job.status, job });
});

/**
 * GET /api/youtube-shorts/jobs
 * Paginated list of jobs for the authenticated user (cursor-based, page size 20).
 * Requirements: 10.1, 11.1
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const cursor = req.query.cursor as string | undefined;
  const PAGE_SIZE = 20;

  const jobs = await prisma.videoJob.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    select: {
      id: true,
      status: true,
      youtubeUrl: true,
      maxClips: true,
      minClipDuration: true,
      maxClipDuration: true,
      burnCaptions: true,
      channelId: true,
      errorReason: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const hasMore = jobs.length > PAGE_SIZE;
  const items = hasMore ? jobs.slice(0, PAGE_SIZE) : jobs;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ jobs: items, nextCursor });
});

/**
 * GET /api/youtube-shorts/jobs/:jobId
 * Return job with clips and latest events.
 * Requirements: 10.2, 10.3, 11.1, 11.4
 */
router.get('/:jobId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;

  const job = await prisma.videoJob.findFirst({
    where: { id: jobId, userId: req.userId },
    include: {
      clips: {
        select: {
          id: true,
          status: true,
          title: true,
          description: true,
          viralScore: true,
          startSeconds: true,
          endSeconds: true,
          thumbnailUrl: true,
          youtubeVideoId: true,
          youtubeUrl: true,
          errorReason: true,
          createdAt: true,
          updatedAt: true,
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
        orderBy: { createdAt: 'asc' },
      },
      events: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          stage: true,
          status: true,
          message: true,
          createdAt: true,
        },
      },
    },
  });

  // Requirement 10.3, 11.4: return 404 for cross-user or missing job
  if (!job) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json({ job });
});

/**
 * DELETE /api/youtube-shorts/jobs/:jobId
 * Cascade delete DB records and S3 objects.
 * Requirements: 10.4, 10.5, 11.1, 11.4
 */
router.delete('/:jobId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;

  const job = await prisma.videoJob.findFirst({
    where: { id: jobId, userId: req.userId },
    select: { id: true, status: true, userId: true },
  });

  // Requirement 11.4: 404 for cross-user or missing
  if (!job) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // Requirement 10.5: 409 if job is currently processing
  if (job.status === 'processing') {
    res.status(409).json({ error: 'job_in_progress' });
    return;
  }

  // Delete S3 objects under {userId}/{jobId}/ (req 10.4)
  try {
    const s3 = getS3Client();
    const prefix = `${job.userId}/${job.id}/`;

    // List all objects under the prefix
    let continuationToken: string | undefined;
    do {
      const listResult = await s3
        .listObjectsV2({
          Bucket: config.S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
        .promise();

      const objects = listResult.Contents ?? [];
      if (objects.length > 0) {
        await s3
          .deleteObjects({
            Bucket: config.S3_BUCKET,
            Delete: {
              Objects: objects.map((o: AWS.S3.Object) => ({ Key: o.Key! })),
              Quiet: true,
            },
          })
          .promise();
      }

      continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (err: unknown) {
    // Log S3 errors but don't block DB deletion
    console.warn(JSON.stringify({
      service: 'youtube-shorts',
      level: 'warn',
      message: 'S3 cleanup failed during job deletion',
      timestamp: new Date().toISOString(),
      jobId,
      detail: err instanceof Error ? err.message : String(err),
    }));
  }

  // Cascade delete handled by Prisma (onDelete: Cascade on clips, events)
  await prisma.videoJob.delete({ where: { id: jobId } });

  res.status(204).send();
});

/**
 * POST /api/youtube-shorts/jobs/:jobId/cancel
 * Cancel a pending or processing job.
 * Requirements: 2.7, 11.1, 11.4
 */
router.post('/:jobId/cancel', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;

  const job = await prisma.videoJob.findFirst({
    where: { id: jobId, userId: req.userId },
    select: { id: true, status: true },
  });

  // Requirement 11.4: 404 for cross-user or missing
  if (!job) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // Only cancel pending or processing jobs
  if (job.status !== 'pending' && job.status !== 'processing') {
    res.status(409).json({ error: 'job_not_cancellable', status: job.status });
    return;
  }

  // Update status to cancelled
  await prisma.videoJob.update({
    where: { id: jobId },
    data: { status: 'cancelled' },
  });

  // Attempt to remove from BullMQ queue if not yet started (req 2.7)
  try {
    const { videoJobQueue } = await import('../lib/queue');
    const bullJob = await videoJobQueue.getJob(jobId);
    if (bullJob) {
      await bullJob.remove();
    }
  } catch (err: unknown) {
    // Log but don't fail — job may already be processing
    console.warn(JSON.stringify({
      service: 'youtube-shorts',
      level: 'warn',
      message: 'Could not remove job from BullMQ queue during cancellation',
      timestamp: new Date().toISOString(),
      jobId,
      detail: err instanceof Error ? err.message : String(err),
    }));
  }

  // Emit job:failed with reason cancelled (req 2.7, 9.5)
  try {
    emitToUser(req.userId, 'job:failed', { jobId, error: 'cancelled' });
  } catch {
    // Socket gateway may not be initialised in test environments
  }

  res.json({ jobId, status: 'cancelled' });
});

export default router;
