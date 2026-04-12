import { randomUUID } from 'crypto';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
import { ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES, MAX_VIDEO_SIZE_BYTES } from 'smas-shared';
import { requireRole } from '../middleware/auth';
import { uploadToS3, deleteFromS3 } from '../lib/s3';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

// 1x1 transparent JPEG placeholder used as video preview thumbnail
const PLACEHOLDER_THUMB = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
    'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
    'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
    'MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA' +
    'AAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAA' +
    'AAAA/9oADAMBAAIRAxEAPwCwABmX/9k=',
  'base64',
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mediaRoutes(app: FastifyInstance | any, prisma: PrismaClient) {
  app.post(
    '/media/upload',
    { preHandler: requireRole('admin', 'editor') },
    async (
      request: { user: { id: string }; file: () => Promise<{ mimetype: string; toBuffer: () => Promise<Buffer> }> },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const userId = request.user.id;

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'no_file_uploaded' });
      }

      const mimeType = data.mimetype;
      const isImage = ACCEPTED_IMAGE_TYPES.includes(mimeType);
      const isVideo = ACCEPTED_VIDEO_TYPES.includes(mimeType);

      if (!isImage && !isVideo) {
        return reply.status(415).send({
          error: 'unsupported_media_type',
          accepted: [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES],
        });
      }

      const fileBuffer = await data.toBuffer();

      if (isVideo && fileBuffer.length > MAX_VIDEO_SIZE_BYTES) {
        return reply.status(413).send({
          error: 'file_too_large',
          max_bytes: MAX_VIDEO_SIZE_BYTES,
        });
      }

      const uuid = randomUUID();
      const ext = MIME_TO_EXT[mimeType] ?? 'bin';
      const s3Key = `media/${userId}/${uuid}.${ext}`;

      const cdnUrl = await uploadToS3(s3Key, fileBuffer, mimeType);

      // Generate thumbnail/preview
      let thumbnailCdnUrl: string | null = null;
      const thumbKey = `media/${userId}/${uuid}_thumb.jpg`;

      if (isImage) {
        const thumbBuffer = await sharp(fileBuffer)
          .resize(300, 300, { fit: 'inside' })
          .jpeg()
          .toBuffer();
        thumbnailCdnUrl = await uploadToS3(thumbKey, thumbBuffer, 'image/jpeg');
      } else {
        // Video: upload placeholder thumbnail (ffmpeg frame extraction is out of scope)
        thumbnailCdnUrl = await uploadToS3(thumbKey, PLACEHOLDER_THUMB, 'image/jpeg');
      }

      const media = await prisma.media.create({
        data: {
          uploaderId: userId,
          s3Key,
          cdnUrl,
          mimeType,
          fileSizeBytes: BigInt(fileBuffer.length),
          thumbnailCdnUrl,
        },
      });

      return reply.status(201).send({
        ...media,
        fileSizeBytes: media.fileSizeBytes.toString(),
      });
    },
  );

  app.delete(
    '/media/:id',
    { preHandler: requireRole('admin', 'editor') },
    async (
      request: { user: { id: string; role: string }; params: { id: string } },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { id } = request.params;
      const { id: userId, role } = request.user;

      const media = await prisma.media.findUnique({ where: { id } });

      if (!media) {
        return reply.status(404).send({ error: 'media_not_found' });
      }

      if (media.uploaderId !== userId && role !== 'admin') {
        return reply.status(403).send({ error: 'forbidden' });
      }

      // Delete DB record first
      await prisma.media.delete({ where: { id } });

      // Delete original file from S3
      await deleteFromS3(media.s3Key);

      // Delete thumbnail if present — derive key by replacing extension with _thumb.jpg
      if (media.thumbnailCdnUrl) {
        const thumbKey = media.s3Key.replace(/\.[^.]+$/, '_thumb.jpg');
        await deleteFromS3(thumbKey);
      }

      return reply.status(204).send(null);
    },
  );
}
