import http from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { verifyAccessToken } from 'smas-shared';
import { config } from '../config';

let io: Server | null = null;

/**
 * Initialises the Socket.io server with the Redis adapter and JWT authentication.
 * Requirements: 9.1, 9.2, 9.6
 */
export function initSocketGateway(httpServer: http.Server): Server {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  // Redis pub/sub clients for horizontal scaling adapter
  const pubClient = new Redis(config.REDIS_URL);
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  // JWT authentication middleware
  // Requirements: 9.6, 11.5
  io.use((socket: Socket, next) => {
    const token =
      (socket.handshake.auth as Record<string, string>).token ??
      extractBearerToken(socket.handshake.headers.authorization);

    if (!token) {
      socket.emit('disconnect', '401');
      socket.disconnect(true);
      return next(new Error('401'));
    }

    try {
      const payload = verifyAccessToken(token, config.SECRET_KEY);
      socket.data.userId = payload.sub;
      next();
    } catch {
      socket.emit('disconnect', '401');
      socket.disconnect(true);
      next(new Error('401'));
    }
  });

  // Join user-scoped room on connection
  // Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
  io.on('connection', (socket: Socket) => {
    const userId: string = socket.data.userId as string;
    socket.join(userId);
  });

  return io;
}

/**
 * Emits an event to all sockets belonging to a specific user.
 * Requirements: 9.2, 9.3, 9.4, 9.5
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) {
    throw new Error('Socket.io gateway has not been initialised. Call initSocketGateway first.');
  }
  io.to(userId).emit(event, payload);
}

function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  return authHeader.slice(7);
}
