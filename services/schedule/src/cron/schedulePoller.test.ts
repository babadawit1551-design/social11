import { describe, it, expect, vi, beforeEach } from 'vitest';
import IORedisMock from 'ioredis-mock';
import { enqueueDuePosts } from './schedulePoller';
import { RATE_LIMIT_PER_DAY } from 'smas-shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChannel() {
  return {
    sendToQueue: vi.fn(),
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    schedule: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    team: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    post: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as any;
}

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    postId: 'post-1',
    scheduledAt: new Date(Date.now() - 1000), // 1 second ago (due)
    status: 'pending',
    post: {
      id: 'post-1',
      teamId: null,
      status: 'scheduled',
      body: 'Hello world',
      createdBy: 'user-1',
      platformPosts: [
        { id: 'pp-1', platformConnectionId: 'conn-1' },
      ],
    },
    ...overrides,
  };
}

// ─── Unit tests ────────────────────────────────────────────────────────────────

describe('enqueueDuePosts', () => {
  it('returns 0 when no due schedules exist', async () => {
    const prisma = makePrisma();
    const channel = makeChannel();
    const redis = new IORedisMock();

    const count = await enqueueDuePosts(prisma as any, channel as any, redis as any);
    expect(count).toBe(0);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('enqueues a due post with status scheduled (no approval workflow)', async () => {
    const redis = new IORedisMock();
    const schedule = makeSchedule();
    const channel = makeChannel();

    const prisma = makePrisma({
      schedule: {
        findMany: vi.fn().mockResolvedValue([schedule]),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const count = await enqueueDuePosts(prisma as any, channel as any, redis as any);
    expect(count).toBe(1);
    expect(channel.sendToQueue).toHaveBeenCalledOnce();
    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: { id: 'sched-1' },
      data: { status: 'enqueued' },
    });
  });

  it('enqueues a post with status approved (approval workflow enabled)', async () => {
    const redis = new IORedisMock();
    const schedule = makeSchedule({
      post: {
        id: 'post-2',
        teamId: 'team-1',
        status: 'approved',
        body: 'Approved post',
        createdBy: 'user-1',
        platformPosts: [{ id: 'pp-2', platformConnectionId: 'conn-2' }],
      },
    });
    const channel = makeChannel();

    const prisma = makePrisma({
      schedule: {
        findMany: vi.fn().mockResolvedValue([schedule]),
        update: vi.fn().mockResolvedValue({}),
      },
      team: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'team-1', approvalWorkflowEnabled: true },
        ]),
      },
    });

    const count = await enqueueDuePosts(prisma as any, channel as any, redis as any);
    expect(count).toBe(1);
    expect(channel.sendToQueue).toHaveBeenCalledOnce();
  });

  it('does NOT enqueue a post with status scheduled when approval workflow is enabled', async () => {
    const redis = new IORedisMock();
    const schedule = makeSchedule({
      post: {
        id: 'post-3',
        teamId: 'team-2',
        status: 'scheduled', // not approved
        body: 'Needs approval',
        createdBy: 'user-1',
        platformPosts: [{ id: 'pp-3', platformConnectionId: 'conn-3' }],
      },
    });
    const channel = makeChannel();

    const prisma = makePrisma({
      schedule: {
        findMany: vi.fn().mockResolvedValue([schedule]),
        update: vi.fn().mockResolvedValue({}),
      },
      team: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'team-2', approvalWorkflowEnabled: true },
        ]),
      },
    });

    const count = await enqueueDuePosts(prisma as any, channel as any, redis as any);
    expect(count).toBe(0);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when rate limit is exceeded', async () => {
    const redis = new IORedisMock();
    const now = new Date();
    const connectionId = 'conn-rate-limited';

    // Pre-fill the rate limit counter to the max using a future date key
    const futureNow = new Date('2099-01-01T12:00:00Z');
    const key = `rate_limit:${connectionId}:2099-01-01`;
    await redis.set(key, String(RATE_LIMIT_PER_DAY));
    // Set expiry to a future timestamp so ioredis-mock doesn't immediately expire it
    const futureTs = Math.floor(new Date('2099-01-02T00:00:00Z').getTime() / 1000);
    await redis.expireat(key, futureTs);

    const schedule = makeSchedule({
      post: {
        id: 'post-4',
        teamId: null,
        status: 'scheduled',
        body: 'Rate limited post',
        createdBy: 'user-1',
        platformPosts: [{ id: 'pp-4', platformConnectionId: connectionId }],
      },
    });
    const channel = makeChannel();

    const prisma = makePrisma({
      schedule: {
        findMany: vi.fn().mockResolvedValue([schedule]),
        update: vi.fn().mockResolvedValue({}),
      },
      post: {
        findUnique: vi.fn().mockResolvedValue({ id: 'post-4', createdBy: 'user-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const count = await enqueueDuePosts(prisma as any, channel as any, redis as any, futureNow);
    expect(count).toBe(0);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('enqueues multiple due posts independently', async () => {
    const redis = new IORedisMock();
    const schedules = [
      makeSchedule({ id: 'sched-a', post: { id: 'post-a', teamId: null, status: 'scheduled', body: 'A', createdBy: 'u1', platformPosts: [{ id: 'pp-a', platformConnectionId: 'conn-a' }] } }),
      makeSchedule({ id: 'sched-b', post: { id: 'post-b', teamId: null, status: 'scheduled', body: 'B', createdBy: 'u1', platformPosts: [{ id: 'pp-b', platformConnectionId: 'conn-b' }] } }),
    ];
    const channel = makeChannel();

    const prisma = makePrisma({
      schedule: {
        findMany: vi.fn().mockResolvedValue(schedules),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    const count = await enqueueDuePosts(prisma as any, channel as any, redis as any);
    expect(count).toBe(2);
    expect(channel.sendToQueue).toHaveBeenCalledTimes(2);
  });
});
