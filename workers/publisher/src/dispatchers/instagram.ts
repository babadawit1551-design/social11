import axios from 'axios';

export interface DispatchResult {
  platformPostId: string;
}

/**
 * Publishes a post to an Instagram Business account using the Meta Graph API.
 * Requirement 8.7: Publisher_Worker SHALL publish to Instagram Business using the Meta Graph API.
 *
 * Instagram requires a two-step process:
 *  1. Create a media container (returns a creation_id)
 *  2. Publish the container
 */
export async function dispatchToInstagram(
  body: string,
  accessToken: string,
  platformAccountId: string,
): Promise<DispatchResult> {
  // Step 1: Create media container (caption-only post)
  const containerResponse = await axios.post(
    `https://graph.facebook.com/v19.0/${platformAccountId}/media`,
    { caption: body, media_type: 'TEXT', access_token: accessToken },
    { headers: { 'Content-Type': 'application/json' } },
  );

  const creationId: string = containerResponse.data?.id;
  if (!creationId) {
    throw new Error('Instagram API did not return a media container ID');
  }

  // Step 2: Publish the container
  const publishResponse = await axios.post(
    `https://graph.facebook.com/v19.0/${platformAccountId}/media_publish`,
    { creation_id: creationId, access_token: accessToken },
    { headers: { 'Content-Type': 'application/json' } },
  );

  const postId: string = publishResponse.data?.id;
  if (!postId) {
    throw new Error('Instagram API did not return a published post ID');
  }

  return { platformPostId: postId };
}
