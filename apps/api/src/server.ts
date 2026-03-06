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
import { initializeEventListeners } from './lib/events';

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

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error Handler (must be last)
app.use(errorHandler);

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📚 API Documentation: http://localhost:${PORT}/health`);
  });
}
