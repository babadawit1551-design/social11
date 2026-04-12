import path from 'path';
import os from 'os';
import fs from 'fs';
import { Worker, Job } from 'bullmq';
import ytdl from 'ytdl-core';
import { whisper } from 'whisper-node';
import ffmpeg from 'fluent-ffmpeg';
import AWS from 'aws-sdk';
import { PrismaClient } from 'smas-shared';
import { config } from '../config';
import { emitToUser } from '../lib/socketGateway';
import { analyzeTranscript } from '../lib/aiAnalyzer';
import { logger } from '../index';
import { generateSrt } from './srtGenerator';

const prisma = new PrismaClient();

const REDIS_CONNECTION = { url: config.REDIS_URL };

/** Retry delays in ms for network errors (req 3.3) */
const RETRY_DELAYS = [5000, 10000, 20000];

/** Maximum video duration in seconds — 3 hours (req 3.4) */
const MAX_DURATION_SECONDS = 10800;

/**
 * Returns the temp directory path for a given job.
 * Temp file path: path.join(os.tmpdir(), 'yt-shorts', jobId, 'source.mp4')
 */
function getTempFilePath(jobId: string): string {
  return path.join(os.tmpdir(), 'yt-shorts', jobId, 'source.mp4');
}

/**
 * Ensures the temp directory for a job exists.
 */
function ensureTempDir(jobId: string): void {
  const dir = path.dirname(getTempFilePath(jobId));
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Deletes the temp directory for a job (req 3.6).
 */
function cleanupTempFiles(jobId: string): void {
  const dir = path.dirname(getTempFilePath(jobId));
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    logger.warn('Failed to clean up temp files', { jobId, error: String(err) });
  }
}

/**
 * Determines whether an error from ytdl.getInfo indicates a private/unavailable video (req 2.3).
 */
function isVideoUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('private') ||
    msg.includes('unavailable') ||
    msg.includes('410') ||
    ('statusCode' in err && (err as { statusCode?: number }).statusCode === 410)
  );
}

/**
 * Determines whether an error is a network/transient error eligible for retry (req 3.3).
 */
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('timeout') ||
    msg.includes('enotfound')
  );
}

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Downloads the source video with retry logic (req 3.1, 3.3).
 * Retries up to 3 times with exponential backoff on network errors.
 * Throws on private/unavailable or after exhausting retries.
 */
async function downloadVideoWithRetry(url: string, destPath: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const stream = ytdl(url, { quality: 'highestvideo' });
        const fileStream = fs.createWriteStream(destPath);

        stream.on('error', reject);
        fileStream.on('error', reject);
        fileStream.on('finish', resolve);

        stream.pipe(fileStream);
      });
      return; // success
    } catch (err) {
      lastError = err;

      // Private/unavailable errors should not be retried
      if (isVideoUnavailableError(err)) {
        throw err;
      }

      // Only retry on network errors
      if (!isNetworkError(err)) {
        throw err;
      }

      if (attempt < RETRY_DELAYS.length) {
        logger.warn('Download failed, retrying...', {
          attempt: attempt + 1,
          delay: RETRY_DELAYS[attempt],
          error: String(err),
        });
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  throw lastError;
}

/**
 * Returns an S3 client configured from environment config.
 */
function getS3Client(): AWS.S3 {
  return new AWS.S3({
    endpoint: config.S3_ENDPOINT || undefined,
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
    s3ForcePathStyle: !!config.S3_ENDPOINT,
  });
}

/**
 * Returns the temp output path for a rendered clip.
 */
function getClipTempPath(jobId: string, clipId: string): string {
  return path.join(os.tmpdir(), 'yt-shorts', jobId, clipId, 'clip.mp4');
}

/**
 * Returns the temp output path for a clip thumbnail.
 */
function getThumbTempPath(jobId: string, clipId: string): string {
  return path.join(os.tmpdir(), 'yt-shorts', jobId, clipId, 'thumbnail.jpg');
}

/**
 * Renders a clip segment from the source video to 1080×1920 (9:16) using FFmpeg.
 * Applies intelligent center-crop (req 5.2).
 * If srtContent is provided and burnCaptions is true, overlays captions (req 5.3).
 */
async function renderClip(
  sourcePath: string,
  outputPath: string,
  startSeconds: number,
  durationSeconds: number,
  burnCaptions: boolean,
  srtContent: string | null,
): Promise<void> {
  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg(sourcePath)
      .seekInput(startSeconds)
      .duration(durationSeconds);

    if (burnCaptions && srtContent) {
      // Write SRT to a temp file for the subtitles filter
      const srtPath = outputPath.replace('clip.mp4', 'captions.srt');
      fs.writeFileSync(srtPath, srtContent, 'utf8');
      // Escape path for ffmpeg filter (handle Windows backslashes and colons)
      const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      cmd = cmd.videoFilters([
        'scale=1080:1920:force_original_aspect_ratio=increase',
        'crop=1080:1920',
        `subtitles=${escapedSrt}:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'`,
      ]);
    } else {
      cmd = cmd.videoFilters([
        'scale=1080:1920:force_original_aspect_ratio=increase',
        'crop=1080:1920',
      ]);
    }

    cmd
      .outputOptions(['-c:v libx264', '-preset fast', '-crf 23', '-c:a aac', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Extracts a thumbnail frame at 1 second from the rendered clip.
 */
async function extractThumbnail(clipPath: string, thumbPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    ffmpeg(clipPath)
      .seekInput(1)
      .frames(1)
      .output(thumbPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Uploads a local file to S3 and returns the file size in bytes.
 */
async function uploadToS3(localPath: string, s3Key: string): Promise<number> {
  const s3 = getS3Client();
  const fileBuffer = fs.readFileSync(localPath);
  await s3
    .putObject({
      Bucket: config.S3_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
    })
    .promise();
  return fileBuffer.length;
}

/**
 * Marks a VideoJob as failed and emits job:failed WebSocket event.
 */
async function failJob(
  jobId: string,
  userId: string,
  errorReason: string,
): Promise<void> {
  await prisma.videoJob.update({
    where: { id: jobId },
    data: { status: 'failed', errorReason },
  });

  emitToUser(userId, 'job:failed', { jobId, error: errorReason });
}

/**
 * Main VideoProcessor job handler.
 * Implements sub-tasks 9.1 (download + duration check) and 9.2 (transcription).
 */
async function processVideoJob(job: Job<{ jobId: string }>): Promise<void> {
  const { jobId } = job.data;

  // Fetch the VideoJob record
  const videoJob = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!videoJob) {
    logger.error('VideoJob not found', { jobId });
    return;
  }

  const { userId, youtubeUrl } = videoJob;
  const tempFilePath = getTempFilePath(jobId);

  try {
    // ── Step 1: Validate duration before downloading (req 3.4) ──────────────
    let videoInfo: ytdl.videoInfo;
    try {
      videoInfo = await ytdl.getInfo(youtubeUrl);
    } catch (err) {
      if (isVideoUnavailableError(err)) {
        // req 2.3: private/unavailable video
        await failJob(jobId, userId, 'video_unavailable');
        return;
      }
      throw err;
    }

    const durationSeconds = parseInt(videoInfo.videoDetails.lengthSeconds, 10);
    if (durationSeconds > MAX_DURATION_SECONDS) {
      // req 3.4: video too long
      await failJob(jobId, userId, 'video_too_long');
      return;
    }

    // ── Step 2: Update status to processing (req 3.1) ───────────────────────
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });

    // ── Step 3: Download source video (req 3.1, 3.3) ────────────────────────
    ensureTempDir(jobId);

    try {
      await downloadVideoWithRetry(youtubeUrl, tempFilePath);
    } catch (err) {
      if (isVideoUnavailableError(err)) {
        await failJob(jobId, userId, 'video_unavailable');
        return;
      }
      // Network error exhausted retries
      await failJob(jobId, userId, 'download_failed');
      return;
    }

    logger.info('Video downloaded', { jobId, path: tempFilePath });

    // ── Step 4: Transcribe with whisper-node (req 3.2, 3.5) ─────────────────
    const segments = await whisper(tempFilePath, { word_timestamps: true });

    // Store transcript in VideoJob record (req 3.5)
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { transcript: segments as object },
    });

    // Emit transcription_complete progress event (req 3.5)
    emitToUser(userId, 'job:progress', {
      jobId,
      status: 'processing',
      stage: 'transcription_complete',
      percentage: 40,
    });

    logger.info('Transcription complete', { jobId });

    // ── Step 5: AI analysis — identify clip segments (req 4.1–4.5) ──────────
    const jobConfig = {
      maxClips: videoJob.maxClips,
      minClipDuration: videoJob.minClipDuration,
      maxClipDuration: videoJob.maxClipDuration,
    };

    let clipSegments;
    try {
      clipSegments = await analyzeTranscript(segments, jobConfig);
    } catch (err) {
      // req 4.4: ai_analysis_failed
      await failJob(jobId, userId, 'ai_analysis_failed');
      return;
    }

    // Create one ShortClip record per identified segment (req 4.5)
    await Promise.all(
      clipSegments.map((seg) =>
        prisma.shortClip.create({
          data: {
            jobId,
            userId,
            startSeconds: seg.startSeconds,
            endSeconds: seg.endSeconds,
            title: seg.title,
            description: seg.description,
            viralScore: seg.viralScore,
          },
        }),
      ),
    );

    // Emit analysis_complete progress event (req 4.5, 9.2)
    emitToUser(userId, 'job:progress', {
      jobId,
      status: 'processing',
      stage: 'analysis_complete',
      percentage: 60,
    });

    logger.info('AI analysis complete', { jobId, clipCount: clipSegments.length });

    // ── Step 6: Render each clip with FFmpeg (req 5.1–5.7) ──────────────────
    const clips = await prisma.shortClip.findMany({ where: { jobId } });
    const totalClips = clips.length;
    let renderedCount = 0;
    const successfulClipIds: string[] = [];

    for (const clip of clips) {
      const clipId = clip.id;
      const durationSeconds = clip.endSeconds - clip.startSeconds;
      const clipOutputPath = getClipTempPath(jobId, clipId);
      const thumbOutputPath = getThumbTempPath(jobId, clipId);

      try {
        // Generate SRT caption content from Whisper segments (req 6.1, 6.2, 6.4)
        const srtContent = generateSrt(segments, clip.startSeconds, clip.endSeconds);

        // Store SRT in ShortClip record (req 6.2)
        await prisma.shortClip.update({
          where: { id: clipId },
          data: { srtContent: srtContent || null },
        });

        // Render the clip segment to 1080×1920 (req 5.1, 5.2, 5.3)
        await renderClip(
          tempFilePath,
          clipOutputPath,
          clip.startSeconds,
          durationSeconds,
          videoJob.burnCaptions,
          srtContent || null,
        );

        // Upload clip to S3 (req 5.4)
        const clipS3Key = `${userId}/${jobId}/${clipId}/clip.mp4`;
        const fileSizeBytes = await uploadToS3(clipOutputPath, clipS3Key);

        // Create ClipVariant record (req 5.4)
        await prisma.clipVariant.create({
          data: {
            clipId,
            s3Key: clipS3Key,
            resolution: '1080x1920',
            durationSec: durationSeconds,
            fileSizeBytes: BigInt(fileSizeBytes),
          },
        });

        // Generate and upload thumbnail
        await extractThumbnail(clipOutputPath, thumbOutputPath);
        const thumbS3Key = `${userId}/${jobId}/${clipId}/thumbnail.jpg`;
        await uploadToS3(thumbOutputPath, thumbS3Key);
        const thumbnailUrl = `${config.CDN_BASE_URL}/${thumbS3Key}`;

        // Update ShortClip status to rendered with thumbnailUrl (req 5.4)
        await prisma.shortClip.update({
          where: { id: clipId },
          data: { status: 'rendered', thumbnailUrl },
        });

        renderedCount++;
        successfulClipIds.push(clipId);

        // Emit job:progress after each clip render (req 5.7)
        emitToUser(userId, 'job:progress', {
          jobId,
          status: 'processing',
          stage: 'clip_rendered',
          percentage: 60 + Math.round((renderedCount / totalClips) * 35),
        });

        // Emit job:clip_ready with thumbnail URL and viral score (req 9.3)
        emitToUser(userId, 'job:clip_ready', {
          jobId,
          clipId,
          thumbnailUrl,
          viralScore: clip.viralScore,
        });

        logger.info('Clip rendered', { jobId, clipId, renderedCount, totalClips });
      } catch (err) {
        // req 5.5: on FFmpeg failure, mark clip as failed and continue
        const errorReason = err instanceof Error ? err.message : String(err);
        logger.error('Clip render failed', { jobId, clipId, error: errorReason });
        await prisma.shortClip.update({
          where: { id: clipId },
          data: { status: 'failed', errorReason },
        }).catch(() => {/* ignore secondary failure */});
      }
    }

    // ── Step 7: Mark job completed (req 5.6, 9.4) ───────────────────────────
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: 'completed' },
    });

    emitToUser(userId, 'job:completed', { jobId, clipIds: successfulClipIds });

    logger.info('VideoJob completed', { jobId, successfulClipIds });

  } catch (err) {
    logger.error('VideoProcessor unexpected error', { jobId, error: String(err) });
    await failJob(jobId, userId, 'processing_error').catch(() => {/* ignore secondary failure */});
  } finally {
    // req 3.6: always clean up temp files
    cleanupTempFiles(jobId);
  }
}

/**
 * Creates and starts the BullMQ Worker for yt-video-jobs.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
export function startVideoProcessorWorker(): Worker<{ jobId: string }> {
  const worker = new Worker<{ jobId: string }>(
    'yt-video-jobs',
    processVideoJob,
    { connection: REDIS_CONNECTION },
  );

  worker.on('completed', (job) => {
    logger.info('VideoProcessor job completed', { jobId: job.data.jobId });
  });

  worker.on('failed', (job, err) => {
    logger.error('VideoProcessor job failed', {
      jobId: job?.data.jobId,
      error: String(err),
    });
  });

  return worker;
}
