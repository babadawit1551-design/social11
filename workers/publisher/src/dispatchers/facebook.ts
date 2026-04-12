import axios from 'axios';

export interface DispatchResult {
  platformPostId: string;
}

/**
 * Publishes a post to a Facebook Page using the Meta Graph API.
 * Requirement 8.6: Publisher_Worker SHALL publish to Facebook Pages using the Meta Graph API.
 */
export async function dispatchToFacebook(
  body: string,
  accessToken: string,
  platformAccountId: string,
): Promise<DispatchResult> {
  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${platformAccountId}/feed`,
    { message: body, access_token: accessToken },
    { headers: { 'Content-Type': 'application/json' } },
  );

  const postId: string = response.data?.id;
  if (!postId) {
    throw new Error('Facebook API did not return a post ID');
  }

  return { platformPostId: postId };
}
