import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

export const s3Client = new S3Client({
  endpoint: config.MINIO_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: config.MINIO_ACCESS_KEY,
    secretAccessKey: config.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

export async function uploadToS3(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.MINIO_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
  return `${config.CDN_BASE_URL}/${key}`;
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: config.MINIO_BUCKET,
      Key: key,
    }),
  );
}
