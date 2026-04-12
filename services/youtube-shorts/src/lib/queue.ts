import { Queue } from 'bullmq';
import { config } from '../config';

const connection = { url: config.REDIS_URL };

/**
 * Queue for processing long-form YouTube video jobs.
 * Requirements: 2.1, 12.2
 */
export const videoJobQueue = new Queue('yt-video-jobs', { connection });

/**
 * Queue for uploading rendered Short clips to YouTube.
 * Requirements: 2.1, 12.2
 */
export const clipUploadQueue = new Queue('yt-clip-uploads', { connection });

/**
 * Enqueues a video processing job by job ID.
 */
export async function enqueueVideoJob(jobId: string): Promise<void> {
  await videoJobQueue.add('process', { jobId }, { jobId });
}

/**
 * Enqueues a clip upload job by clip ID.
 */
export async function enqueueClipUpload(clipId: string): Promise<void> {
  await clipUploadQueue.add('upload', { clipId }, { jobId: clipId });
}
