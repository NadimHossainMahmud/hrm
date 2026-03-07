import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createLogger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { mfaRouter } from './routes/mfa';
import { employeesRouter } from './routes/employees';
import { departmentsRouter } from './routes/departments';
import { locationsRouter } from './routes/locations';
import { webhooksRouter } from './routes/webhooks';
import { billingRouter } from './routes/billing';
import { notificationsRouter } from './routes/notifications';
import { workflowsRouter } from './routes/workflows';
import { hiringRouter } from './routes/hiring';
import { careersPublicRouter } from './routes/careers-public';
import { initializeEventListeners } from './lib/events';
import { initSocket } from './lib/socket';
import { startEmailWorker } from './jobs/email.job';

// Load environment variables
dotenv.config();

const logger = createLogger();

export const app = express();
const PORT = process.env.PORT || 3001;

// Initialize event listeners
initializeEventListeners();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(rateLimiter);

// Webhooks (must be before body parsers due to Express.raw needed for Stripe signature evaluation)
app.use('/v1/webhooks', webhooksRouter);

// Body Parsing Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API Routes
app.use('/health', healthRouter);
app.use('/v1/auth', authRouter);
app.use('/v1/mfa', mfaRouter);
app.use('/v1/employees', employeesRouter);
app.use('/v1/departments', departmentsRouter);
app.use('/v1/locations', locationsRouter);
app.use('/v1/billing', billingRouter);
app.use('/v1/notifications', notificationsRouter);
app.use('/v1/workflows', workflowsRouter);
app.use('/v1/public/careers', careersPublicRouter);
app.use('/v1', hiringRouter);

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error Handler (must be last)
app.use(errorHandler);

// Start server with HTTP server for Socket.io (Phase 4)
if (require.main === module) {
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  // Start background job workers (Phase 4)
  let emailWorker: ReturnType<typeof startEmailWorker> | null = null;
  try {
    emailWorker = startEmailWorker();
  } catch (err) {
    logger.warn('Email worker not started (Redis may be unavailable)', { err });
  }

  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📚 API Documentation: http://localhost:${PORT}/health`);
  });

  const shutdown = () => {
    logger.info('Shutting down...');
    emailWorker?.close();
    httpServer.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
