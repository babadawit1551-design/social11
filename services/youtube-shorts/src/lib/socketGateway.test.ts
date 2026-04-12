import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockJoin = vi.fn();
const mockEmit = vi.fn();
const mockDisconnect = vi.fn();
const mockTo = vi.fn(() => ({ emit: mockEmit }));
const mockUse = vi.fn();
const mockOn = vi.fn();
const mockAdapter = vi.fn();

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    adapter: mockAdapter,
    use: mockUse,
    on: mockOn,
    to: mockTo,
  })),
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn().mockReturnValue('mock-adapter'),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    duplicate: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('smas-shared', () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock('../config', () => ({
  config: {
    REDIS_URL: 'redis://localhost:6379',
    SECRET_KEY: 'test-secret',
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { initSocketGateway, emitToUser } from './socketGateway';
import { verifyAccessToken } from 'smas-shared';
import http from 'http';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('socketGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initSocketGateway', () => {
    it('creates a Socket.io server and attaches the Redis adapter', () => {
      const httpServer = {} as http.Server;

      initSocketGateway(httpServer);

      // The adapter mock returns 'mock-adapter'; verify it was passed to io.adapter()
      expect(mockAdapter).toHaveBeenCalledWith('mock-adapter');
    });

    it('registers a connection handler that joins the user room', () => {
      const httpServer = {} as http.Server;
      initSocketGateway(httpServer);

      // Capture the 'connection' handler registered via io.on(...)
      const [event, handler] = mockOn.mock.calls[0];
      expect(event).toBe('connection');

      const fakeSocket = {
        data: { userId: 'user-123' },
        join: mockJoin,
      };
      handler(fakeSocket);

      expect(mockJoin).toHaveBeenCalledWith('user-123');
    });

    describe('JWT middleware', () => {
      it('accepts a valid token from handshake.auth.token and attaches userId', () => {
        vi.mocked(verifyAccessToken).mockReturnValue({
          sub: 'user-abc',
          role: 'user',
          type: 'access',
        });

        const httpServer = {} as http.Server;
        initSocketGateway(httpServer);

        const [middleware] = mockUse.mock.calls[0];
        const fakeSocket = {
          handshake: { auth: { token: 'valid.jwt.token' }, headers: {} },
          data: {} as Record<string, unknown>,
          emit: mockEmit,
          disconnect: mockDisconnect,
        };
        const next = vi.fn();

        middleware(fakeSocket, next);

        expect(verifyAccessToken).toHaveBeenCalledWith('valid.jwt.token', 'test-secret');
        expect(fakeSocket.data.userId).toBe('user-abc');
        expect(next).toHaveBeenCalledWith();
      });

      it('accepts a valid token from Authorization Bearer header', () => {
        vi.mocked(verifyAccessToken).mockReturnValue({
          sub: 'user-xyz',
          role: 'user',
          type: 'access',
        });

        const httpServer = {} as http.Server;
        initSocketGateway(httpServer);

        const [middleware] = mockUse.mock.calls[0];
        const fakeSocket = {
          handshake: {
            auth: {},
            headers: { authorization: 'Bearer header.jwt.token' },
          },
          data: {} as Record<string, unknown>,
          emit: mockEmit,
          disconnect: mockDisconnect,
        };
        const next = vi.fn();

        middleware(fakeSocket, next);

        expect(verifyAccessToken).toHaveBeenCalledWith('header.jwt.token', 'test-secret');
        expect(fakeSocket.data.userId).toBe('user-xyz');
        expect(next).toHaveBeenCalledWith();
      });

      it('rejects connections with no token — disconnects with 401', () => {
        const httpServer = {} as http.Server;
        initSocketGateway(httpServer);

        const [middleware] = mockUse.mock.calls[0];
        const fakeSocket = {
          handshake: { auth: {}, headers: {} },
          data: {} as Record<string, unknown>,
          emit: mockEmit,
          disconnect: mockDisconnect,
        };
        const next = vi.fn();

        middleware(fakeSocket, next);

        expect(mockDisconnect).toHaveBeenCalledWith(true);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(next.mock.calls[0][0].message).toBe('401');
      });

      it('rejects connections with an invalid token — disconnects with 401', () => {
        vi.mocked(verifyAccessToken).mockImplementation(() => {
          throw new Error('invalid signature');
        });

        const httpServer = {} as http.Server;
        initSocketGateway(httpServer);

        const [middleware] = mockUse.mock.calls[0];
        const fakeSocket = {
          handshake: { auth: { token: 'bad.token' }, headers: {} },
          data: {} as Record<string, unknown>,
          emit: mockEmit,
          disconnect: mockDisconnect,
        };
        const next = vi.fn();

        middleware(fakeSocket, next);

        expect(mockDisconnect).toHaveBeenCalledWith(true);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(next.mock.calls[0][0].message).toBe('401');
      });
    });
  });

  describe('emitToUser', () => {
    it('emits an event to the user room', () => {
      const httpServer = {} as http.Server;
      initSocketGateway(httpServer);

      emitToUser('user-123', 'job:progress', { jobId: 'j1', percentage: 50 });

      expect(mockTo).toHaveBeenCalledWith('user-123');
      expect(mockEmit).toHaveBeenCalledWith('job:progress', { jobId: 'j1', percentage: 50 });
    });

    it('throws if called before initSocketGateway', async () => {
      // Re-import a fresh module instance to get uninitialised state
      vi.resetModules();

      // Re-apply mocks for the fresh module
      vi.mock('socket.io', () => ({
        Server: vi.fn().mockImplementation(() => ({
          adapter: mockAdapter,
          use: mockUse,
          on: mockOn,
          to: mockTo,
        })),
      }));
      vi.mock('@socket.io/redis-adapter', () => ({
        createAdapter: vi.fn().mockReturnValue('mock-adapter'),
      }));
      vi.mock('ioredis', () => ({
        Redis: vi.fn().mockImplementation(() => ({ duplicate: vi.fn().mockReturnThis() })),
      }));
      vi.mock('smas-shared', () => ({ verifyAccessToken: vi.fn() }));
      vi.mock('../config', () => ({
        config: { REDIS_URL: 'redis://localhost:6379', SECRET_KEY: 'test-secret' },
      }));

      const { emitToUser: freshEmit } = await import('./socketGateway');
      expect(() => freshEmit('user-1', 'job:failed', {})).toThrow(
        'Socket.io gateway has not been initialised',
      );
    });
  });
});
