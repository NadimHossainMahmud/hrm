/**
 * Socket.io server for real-time notifications — Phase 4
 * Clients join room by userId; we emit notification:created when a notification is created.
 */
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken, TokenPayload } from './jwt';
import { eventEmitter, NOTIFICATION_CREATED } from './events';
import { createLogger } from '../utils/logger';

const logger = createLogger();

let io: Server | null = null;

export function getIO(): Server | null {
  return io;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
    path: '/socket.io',
  });

  io.on('connection', (socket: Socket) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (!token) {
      logger.debug('Socket connection rejected: no token');
      socket.disconnect(true);
      return;
    }

    let payload: TokenPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      logger.debug('Socket connection rejected: invalid token');
      socket.disconnect(true);
      return;
    }

    const room = `user:${payload.userId}`;
    socket.join(room);
    logger.debug('Socket connected', { userId: payload.userId, socketId: socket.id });

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { userId: payload.userId, reason });
    });
  });

  // When a notification is created, emit to the user's room
  eventEmitter.on(NOTIFICATION_CREATED, (payload: { userId: string; [key: string]: unknown }) => {
    if (io) {
      io.to(`user:${payload.userId}`).emit('notification', payload);
      logger.debug('Notification emitted to user room', { userId: payload.userId });
    }
  });

  logger.info('Socket.io server initialized');
  return io;
}
