/**
 * BullMQ queue setup — Phase 4
 * Redis-backed queues: email, pdf, reports, webhooks, compliance, ai
 */
import { Queue, Worker, Job } from 'bullmq';
import { createLogger } from '../utils/logger';

const logger = createLogger();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

const defaultJobOptions = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
};

// Queue names
export const QUEUE_NAMES = {
  EMAIL: 'email',
  PDF: 'pdf',
  REPORTS: 'reports',
  WEBHOOKS: 'webhooks',
  COMPLIANCE: 'compliance',
  AI: 'ai',
} as const;

// Email job payload
export interface EmailJobPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

// Create queues
export const emailQueue = new Queue<EmailJobPayload>(QUEUE_NAMES.EMAIL, {
  connection,
  defaultJobOptions,
});

export const pdfQueue = new Queue(QUEUE_NAMES.PDF, {
  connection,
  defaultJobOptions,
});

export const reportsQueue = new Queue(QUEUE_NAMES.REPORTS, {
  connection,
  defaultJobOptions,
});

export const webhooksQueue = new Queue(QUEUE_NAMES.WEBHOOKS, {
  connection,
  defaultJobOptions,
});

export const complianceQueue = new Queue(QUEUE_NAMES.COMPLIANCE, {
  connection,
  defaultJobOptions,
});

export const aiQueue = new Queue(QUEUE_NAMES.AI, {
  connection,
  defaultJobOptions,
});

export const allQueues = {
  [QUEUE_NAMES.EMAIL]: emailQueue,
  [QUEUE_NAMES.PDF]: pdfQueue,
  [QUEUE_NAMES.REPORTS]: reportsQueue,
  [QUEUE_NAMES.WEBHOOKS]: webhooksQueue,
  [QUEUE_NAMES.COMPLIANCE]: complianceQueue,
  [QUEUE_NAMES.AI]: aiQueue,
};

/**
 * Add email to queue (non-blocking)
 */
export async function queueEmail(payload: EmailJobPayload): Promise<Job<EmailJobPayload> | null> {
  try {
    const job = await emailQueue.add('send', payload, { priority: 1 });
    logger.debug('Email queued', { jobId: job.id, to: payload.to });
    return job;
  } catch (error) {
    logger.error('Failed to queue email', { error, payload });
    return null;
  }
}

/**
 * Gracefully close all queue connections (call in shutdown)
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    emailQueue.close(),
    pdfQueue.close(),
    reportsQueue.close(),
    webhooksQueue.close(),
    complianceQueue.close(),
    aiQueue.close(),
  ]);
  logger.info('All queues closed');
}
