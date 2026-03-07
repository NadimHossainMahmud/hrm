/**
 * Notifications API — Phase 4
 * GET /v1/notifications, PATCH /:id/read, POST mark-all-read, GET/PATCH preferences
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContext } from '../middleware/tenantContext';
import { authorize } from '../middleware/authorize';
import { ApiError } from '../middleware/errorHandler';
import * as notificationService from '../services/notification.service';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// GET /v1/notifications — List notifications (paginated)
router.get(
  '/',
  authorize('notifications.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const unreadOnly = req.query.unread_only === 'true';
      const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

      const result = await notificationService.listNotifications(tenantId, userId, {
        unreadOnly,
        limit,
        cursor,
      });

      return res.json({
        success: true,
        data: result.notifications,
        meta: {
          nextCursor: result.nextCursor,
          unreadCount: result.unreadCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/notifications/unread-count — Unread count for bell icon
router.get(
  '/unread-count',
  authorize('notifications.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const result = await notificationService.listNotifications(tenantId, userId, {
        unreadOnly: true,
        limit: 1,
      });
      return res.json({
        success: true,
        data: { unreadCount: result.unreadCount },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/notifications/mark-all-read — Mark all as read (must be before /:id)
router.post(
  '/mark-all-read',
  authorize('notifications.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const count = await notificationService.markAllAsRead(tenantId, userId);
      return res.json({ success: true, data: { markedCount: count } });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /v1/notifications/:id/read — Mark one as read
router.patch(
  '/:id/read',
  authorize('notifications.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const { id } = req.params;
      const updated = await notificationService.markAsRead(tenantId, userId, id);
      if (!updated) {
        throw new ApiError(404, 'Notification not found');
      }
      return res.json({ success: true, data: { read: true } });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/notifications/preferences — Get notification preferences
router.get(
  '/preferences',
  authorize('notifications.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const prefs = await notificationService.getPreferences(tenantId, userId);
      return res.json({ success: true, data: prefs });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /v1/notifications/preferences — Update preference for an event type
router.patch(
  '/preferences',
  authorize('notifications.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const { eventType, inApp, email } = req.body as {
        eventType: string;
        inApp?: boolean;
        email?: boolean;
      };
      if (!eventType || typeof eventType !== 'string') {
        throw new ApiError(400, 'eventType is required');
      }
      const updated = await notificationService.updatePreference(tenantId, userId, eventType, {
        inApp,
        email,
      });
      return res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

export const notificationsRouter = router;
