/**
 * Email job processor — Phase 4
 * Processes queued emails via Nodemailer (SendGrid/SES compatible SMTP)
 */
import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { createLogger } from '../utils/logger';
import { EmailJobPayload } from '../lib/queue';

const logger = createLogger();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

function getTransporter() {
  const host = process.env.SMTP_HOST || 'localhost';
  const port = parseInt(process.env.SMTP_PORT || '1025', 10); // 1025 = MailHog default for dev
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export function startEmailWorker(): Worker<EmailJobPayload> {
  const worker = new Worker<EmailJobPayload>(
    'email',
    async (job) => {
      const { to, subject, html, text } = job.data;
      const transporter = getTransporter();

      const mailOptions = {
        from: process.env.SMTP_FROM || 'HRForge <noreply@hrforge.com>',
        to,
        subject,
        html: html || undefined,
        text: text || (html ? html.replace(/<[^>]*>/g, '') : undefined),
      };

      await transporter.sendMail(mailOptions);
      logger.info('Email sent', { jobId: job.id, to, subject });
      return { sent: true, to, subject };
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('Email job failed', { jobId: job?.id, error: err?.message });
  });

  worker.on('error', (err) => {
    logger.error('Email worker error', { error: err?.message });
  });

  logger.info('Email worker started');
  return worker;
}
