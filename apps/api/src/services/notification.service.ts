/**
 * Notification service — Phase 4
 * Creates notifications, respects preferences, queues emails, and can emit real-time events.
 */
import { prisma } from '../lib/prisma';
import { queueEmail } from '../lib/queue';
import { eventEmitter, NOTIFICATION_CREATED } from '../lib/events';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface NotifyInput {
  tenantId: string;
  userId: string;
  type: string;
  title?: string;
  message?: string;
  resourceType?: string;
  resourceId?: string;
  channel?: 'in_app' | 'email' | 'both';
  emailPayload?: { subject: string; html?: string; text?: string };
}

/**
 * Get user's preference for an event type (in_app, email, or both).
 * Defaults to both if no preference set.
 */
async function getChannelForUser(
  userId: string,
  eventType: string,
  requestedChannel: 'in_app' | 'email' | 'both' = 'both'
): Promise<{ inApp: boolean; email: boolean }> {
  const pref = await prisma.notificationPreference.findUnique({
    where: {
      userId_eventType: { userId, eventType: eventType },
    },
  });
  if (!pref) {
    return {
      inApp: requestedChannel === 'in_app' || requestedChannel === 'both',
      email: requestedChannel === 'email' || requestedChannel === 'both',
    };
  }
  return {
    inApp: pref.inApp,
    email: pref.email,
  };
}

/**
 * Create in-app notification and optionally send email (queued).
 * Call notify() from workflow, time-off, etc.
 */
export async function notify(input: NotifyInput): Promise<string | null> {
  const channel = input.channel || 'both';
  const { inApp, email } = await getChannelForUser(input.userId, input.type, channel);

  let notificationId: string | null = null;

  if (inApp) {
    const notification = await prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        title: input.title ?? null,
        message: input.message ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        channel: channel,
      },
    });
    notificationId = notification.id;
    logger.debug('Notification created', { id: notification.id, userId: input.userId, type: input.type });
    eventEmitter.emit(NOTIFICATION_CREATED, {
      notificationId: notification.id,
      userId: input.userId,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      message: input.message,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      createdAt: notification.createdAt,
    });
  }

  if (email && (input.emailPayload || input.message)) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (user?.email) {
      const subject = input.emailPayload?.subject ?? input.title ?? 'Notification';
      const html = input.emailPayload?.html ?? (input.message ? `<p>${input.message}</p>` : undefined);
      const text = input.emailPayload?.text ?? input.message;
      await queueEmail({
        to: user.email,
        subject,
        html,
        text,
      });
    }
  }

  return notificationId;
}

/**
 * List notifications for a user (paginated).
 */
export async function listNotifications(
  tenantId: string,
  userId: string,
  options: { unreadOnly?: boolean; limit?: number; cursor?: string } = {}
) {
  const { unreadOnly = false, limit = 20, cursor } = options;

  const where = {
    tenantId,
    userId,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const items = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const list = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? list[list.length - 1].id : null;

  const unreadCount = await prisma.notification.count({
    where: { tenantId, userId, isRead: false },
  });

  return {
    notifications: list,
    nextCursor,
    unreadCount,
  };
}

/**
 * Mark a notification as read.
 */
export async function markAsRead(
  tenantId: string,
  userId: string,
  notificationId: string
): Promise<boolean> {
  const updated = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      tenantId,
      userId,
    },
    data: { isRead: true, readAt: new Date() },
  });
  return updated.count > 0;
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(tenantId: string, userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { tenantId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

/**
 * Get notification preferences for a user.
 */
export async function getPreferences(tenantId: string, userId: string) {
  return prisma.notificationPreference.findMany({
    where: { tenantId, userId },
    orderBy: { eventType: 'asc' },
  });
}

/**
 * Update or create notification preference.
 */
export async function updatePreference(
  tenantId: string,
  userId: string,
  eventType: string,
  data: { inApp?: boolean; email?: boolean }
) {
  return prisma.notificationPreference.upsert({
    where: {
      userId_eventType: { userId, eventType },
    },
    create: {
      tenantId,
      userId,
      eventType,
      inApp: data.inApp ?? true,
      email: data.email ?? true,
    },
    update: {
      ...(data.inApp !== undefined && { inApp: data.inApp }),
      ...(data.email !== undefined && { email: data.email }),
    },
  });
}
