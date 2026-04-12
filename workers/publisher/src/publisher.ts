import { PrismaClient } from 'smas-shared';
import { dispatchToTwitter } from './dispatchers/twitter';
import { dispatchToLinkedIn } from './dispatchers/linkedin';
import { dispatchToFacebook } from './dispatchers/facebook';
import { dispatchToInstagram } from './dispatchers/instagram';
import { dispatchWebhookEvent } from './webhookDispatcher';

export interface PublishMessage {
  postId: string;
  scheduleId: string;
}

/**
 * Dispatches a single platform post to the appropriate platform API.
 * Returns the platform-assigned post ID on success, or throws on failure.
 */
async function dispatchToPlatform(
  platform: string,
  body: string,
  accessToken: string,
  platformAccountId: string,
): Promise<string> {
  switch (platform) {
    case 'twitter':
      return (await dispatchToTwitter(body, accessToken)).platformPostId;
    case 'linkedin':
      return (await dispatchToLinkedIn(body, accessToken, platformAccountId)).platformPostId;
    case 'facebook':
      return (await dispatchToFacebook(body, accessToken, platformAccountId)).platformPostId;
    case 'instagram':
      return (await dispatchToInstagram(body, accessToken, platformAccountId)).platformPostId;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Processes a single publish message from the queue.
 *
 * Requirements 8.1–8.7:
 * - Fetches Post and Platform_Posts from DB
 * - Dispatches to each target platform API independently
 * - On success: updates Platform_Post status to `published`, records platform_post_id and published_at
 * - On failure: updates Platform_Post status to `failed`, records error_message
 * - Failure on one platform does NOT block others (Requirement 8.3)
 */
export async function processPublishMessage(
  prisma: PrismaClient,
  message: PublishMessage,
): Promise<void> {
  const { postId } = message;

  // Fetch the post with its platform posts and their connections
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      platformPosts: {
        include: {
          platformConnection: true,
        },
      },
    },
  });

  if (!post) {
    console.error(`[publisher] Post not found: ${postId}`);
    return;
  }

  console.log(
    `[publisher] Processing post ${postId} for ${post.platformPosts.length} platform(s)`,
  );

  // Dispatch to each platform independently — failure on one must not block others (Req 8.3)
  const dispatches = post.platformPosts.map(async (platformPost: typeof post.platformPosts[number]): Promise<string | null> => {
    const { id: platformPostId, platform, platformConnection } = platformPost;

    try {
      const remotePostId = await dispatchToPlatform(
        platform,
        post.body,
        platformConnection.accessToken,
        platformConnection.platformAccountId,
      );

      // Requirement 8.2: update status to `published`, record platform_post_id and published_at
      await prisma.platformPost.update({
        where: { id: platformPostId },
        data: {
          status: 'published',
          platformPostId: remotePostId,
          publishedAt: new Date(),
          errorMessage: null,
        },
      });

      console.log(
        `[publisher] ✓ Published platform_post ${platformPostId} (${platform}) → remote id: ${remotePostId}`,
      );
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      // Requirement 8.3: record error_message but keep status `pending` so retry logic can retry
      // Status will be set to `failed` only after all retries are exhausted (by index.ts)
      await prisma.platformPost.update({
        where: { id: platformPostId },
        data: {
          errorMessage,
        },
      });

      console.error(
        `[publisher] ✗ Failed platform_post ${platformPostId} (${platform}): ${errorMessage}`,
      );

      // Return the error so we can detect partial/full failure below
      return errorMessage;
    }

    return null;
  });

  // Wait for all dispatches to settle — Promise.allSettled ensures one failure doesn't cancel others
  const results = await Promise.allSettled(dispatches);

  // Collect failures
  const failures: string[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      failures.push(result.value);
    } else if (result.status === 'rejected') {
      failures.push(String(result.reason));
    }
  }

  if (failures.length > 0) {
    // Some platforms failed — throw so the caller (index.ts) can apply retry logic
    throw new Error(`${failures.length} platform(s) failed: ${failures.join('; ')}`);
  }

  // All platforms succeeded — update parent post status
  await prisma.post.update({
    where: { id: postId },
    data: { status: 'published' as any },
  });

  console.log(`[publisher] Post ${postId} final status: published`);

  // Fire post.published webhook event
  await dispatchWebhookEvent(prisma, 'post.published', {
    postId,
    publishedAt: new Date().toISOString(),
  }).catch((err) => {
    console.error(`[publisher] Failed to dispatch post.published webhook for post ${postId}:`, err);
  });
}
