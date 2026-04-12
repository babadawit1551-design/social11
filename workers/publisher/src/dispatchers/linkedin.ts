import axios from 'axios';

export interface DispatchResult {
  platformPostId: string;
}

/**
 * Publishes a post to LinkedIn using the LinkedIn Marketing API.
 * Requirement 8.5: Publisher_Worker SHALL publish to LinkedIn using the LinkedIn Marketing API.
 */
export async function dispatchToLinkedIn(
  body: string,
  accessToken: string,
  platformAccountId: string,
): Promise<DispatchResult> {
  const response = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author: `urn:li:organization:${platformAccountId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: body },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    },
  );

  // LinkedIn returns the post URN in the `id` field or `X-RestLi-Id` header
  const postId: string =
    response.data?.id ?? response.headers?.['x-restli-id'];
  if (!postId) {
    throw new Error('LinkedIn API did not return a post ID');
  }

  return { platformPostId: postId };
}
