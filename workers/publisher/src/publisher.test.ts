import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { processPublishMessage } from './publisher';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PlatformPostRecord = {
  id: string;
  platform: string;
  platformConnection: { accessToken: string; platformAccountId: string };
};

function makePrisma(platformPosts: PlatformPostRecord[], postStatus = 'scheduled') {
  const platformPostUpdate = vi.fn().mockResolvedValue({});
  const postUpdate = vi.fn().mockResolvedValue({});
  const postFindUnique = vi.fn().mockResolvedValue({
    id: 'post-1',
    body: 'Test post body',
    status: postStatus,
    platformPosts,
  });

  return {
    post: { findUnique: postFindUnique, update: postUpdate },
    platformPost: { update: platformPostUpdate },
    _mocks: { platformPostUpdate, postUpdate, postFindUnique },
  } as any;
}

function makePlatformPost(id: string, platform: string): PlatformPostRecord {
  return {
    id,
    platform,
    platformConnection: {
      accessToken: `token-${platform}`,
      platformAccountId: `account-${platform}`,
    },
  };
}

// ─── Unit tests ────────────────────────────────────────────────────────────────

describe('processPublishMessage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns early when post is not found', async () => {
    const prisma = makePrisma([]);
    prisma.post.findUnique = vi.fn().mockResolvedValue(null);

    // Should not throw
    await expect(
      processPublishMessage(prisma, { postId: 'missing', scheduleId: 'sched-1' }),
    ).resolves.toBeUndefined();
  });

  it('dispatches to all platforms and marks post published on full success', async () => {
    const platformPosts = [
      makePlatformPost('pp-tw', 'twitter'),
      makePlatformPost('pp-li', 'linkedin'),
    ];
    const prisma = makePrisma(platformPosts);

    // Mock axios calls via vi.mock at module level is complex; instead we mock the dispatchers
    const { dispatchToTwitter } = await import('./dispatchers/twitter');
    const { dispatchToLinkedIn } = await import('./dispatchers/linkedin');

    vi.spyOn(await import('./dispatchers/twitter'), 'dispatchToTwitter').mockResolvedValue({ platformPostId: 'tw-123' });
    vi.spyOn(await import('./dispatchers/linkedin'), 'dispatchToLinkedIn').mockResolvedValue({ platformPostId: 'li-456' });

    await processPublishMessage(prisma, { postId: 'post-1', scheduleId: 'sched-1' });

    // Both platform posts should be updated to published
    expect(prisma._mocks.platformPostUpdate).toHaveBeenCalledTimes(2);
    const calls = prisma._mocks.platformPostUpdate.mock.calls;
    const statuses = calls.map((c: any) => c[0].data.status);
    expect(statuses).toContain('published');
    expect(statuses).toContain('published');

    // Parent post should be updated to published
    expect(prisma._mocks.postUpdate).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'published' },
    });
  });

  it('records error on platform failure but does not throw for single platform', async () => {
    const platformPosts = [makePlatformPost('pp-tw', 'twitter')];
    const prisma = makePrisma(platformPosts);

    vi.spyOn(await import('./dispatchers/twitter'), 'dispatchToTwitter').mockRejectedValue(
      new Error('Twitter API error'),
    );

    // Should throw because at least one platform failed
    await expect(
      processPublishMessage(prisma, { postId: 'post-1', scheduleId: 'sched-1' }),
    ).rejects.toThrow('1 platform(s) failed');

    // Error should be recorded on the platform post
    expect(prisma._mocks.platformPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pp-tw' },
        data: expect.objectContaining({ errorMessage: 'Twitter API error' }),
      }),
    );
  });

  it('throws with failure count when all platforms fail', async () => {
    const platformPosts = [
      makePlatformPost('pp-tw', 'twitter'),
      makePlatformPost('pp-fb', 'facebook'),
    ];
    const prisma = makePrisma(platformPosts);

    vi.spyOn(await import('./dispatchers/twitter'), 'dispatchToTwitter').mockRejectedValue(new Error('Twitter down'));
    vi.spyOn(await import('./dispatchers/facebook'), 'dispatchToFacebook').mockRejectedValue(new Error('Facebook down'));

    await expect(
      processPublishMessage(prisma, { postId: 'post-1', scheduleId: 'sched-1' }),
    ).rejects.toThrow('2 platform(s) failed');
  });
});

// ─── Property-based tests ──────────────────────────────────────────────────────

describe('Property 15: Independent platform failure isolation', () => {
  // Feature: social-media-automation-system, Property 15: For any Post targeting multiple Platforms where one Platform API call fails, the failure should only affect the Platform_Post for that Platform; other Platform_Posts should proceed to `published` status independently.

  const allPlatforms = ['twitter', 'linkedin', 'facebook', 'instagram'] as const;
  type Platform = typeof allPlatforms[number];

  // Map platform name → dispatcher module path and exported function name
  const dispatcherInfo: Record<Platform, { path: string; fn: string }> = {
    twitter: { path: './dispatchers/twitter', fn: 'dispatchToTwitter' },
    linkedin: { path: './dispatchers/linkedin', fn: 'dispatchToLinkedIn' },
    facebook: { path: './dispatchers/facebook', fn: 'dispatchToFacebook' },
    instagram: { path: './dispatchers/instagram', fn: 'dispatchToInstagram' },
  };

  it('successful platforms are published even when one platform fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Pick a subset of platforms (at least 2)
        fc.shuffledSubarray(allPlatforms, { minLength: 2, maxLength: 4 }),
        // Pick which index fails (0-based)
        fc.nat({ max: 3 }),
        async (platforms, failIdx) => {
          if (platforms.length < 2) return; // skip degenerate case
          const failingPlatform = platforms[failIdx % platforms.length];
          const successPlatforms = platforms.filter((p) => p !== failingPlatform);

          // Build platform posts
          const platformPosts = platforms.map((p) => makePlatformPost(`pp-${p}`, p));
          const prisma = makePrisma(platformPosts);

          // Mock dispatchers: failing platform throws, others succeed
          for (const p of platforms) {
            const info = dispatcherInfo[p];
            const mod = await import(info.path);
            if (p === failingPlatform) {
              vi.spyOn(mod, info.fn as any).mockRejectedValue(new Error(`${p} API error`));
            } else {
              vi.spyOn(mod, info.fn as any).mockResolvedValue({
                platformPostId: `${p}-remote-id`,
              });
            }
          }

          // processPublishMessage should throw (because at least one platform failed)
          await expect(
            processPublishMessage(prisma, { postId: 'post-1', scheduleId: 'sched-1' }),
          ).rejects.toThrow();

          // Successful platforms must have been updated to 'published'
          const updateCalls = prisma._mocks.platformPostUpdate.mock.calls as any[];
          for (const successPlatform of successPlatforms) {
            const ppId = `pp-${successPlatform}`;
            const successCall = updateCalls.find(
              (c) => c[0].where.id === ppId && c[0].data.status === 'published',
            );
            expect(
              successCall,
              `Expected platform_post ${ppId} (${successPlatform}) to be published`,
            ).toBeDefined();
          }

          // Failing platform must NOT have been updated to 'published'
          const failPpId = `pp-${failingPlatform}`;
          const failPublishedCall = updateCalls.find(
            (c) => c[0].where.id === failPpId && c[0].data.status === 'published',
          );
          expect(
            failPublishedCall,
            `Expected platform_post ${failPpId} (${failingPlatform}) NOT to be published`,
          ).toBeUndefined();

          // Failing platform must have an errorMessage recorded
          const failErrorCall = updateCalls.find(
            (c) => c[0].where.id === failPpId && c[0].data.errorMessage,
          );
          expect(
            failErrorCall,
            `Expected platform_post ${failPpId} (${failingPlatform}) to have errorMessage`,
          ).toBeDefined();

          vi.restoreAllMocks();
        },
      ),
      { numRuns: 100 },
    );
  });
});
