import axios from 'axios';

export interface DispatchResult {
  platformPostId: string;
}

/**
 * Publishes a post to Twitter using the Twitter API v2.
 * Requirement 8.4: Publisher_Worker SHALL publish to X/Twitter using the Twitter API v2.
 */
export async function dispatchToTwitter(
  body: string,
  accessToken: string,
): Promise<DispatchResult> {
  const response = await axios.post(
    'https://api.twitter.com/2/tweets',
    { text: body },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const tweetId: string = response.data?.data?.id;
  if (!tweetId) {
    throw new Error('Twitter API did not return a tweet ID');
  }

  return { platformPostId: tweetId };
}
