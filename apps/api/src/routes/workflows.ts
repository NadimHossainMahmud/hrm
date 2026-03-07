/**
 * Workflows API — Phase 4
 * Templates CRUD, instances list, approve/reject, my pending approvals
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContext } from '../middleware/tenantContext';
import { authorize } from '../middleware/authorize';
import { ApiError } from '../middleware/errorHandler';
import * as workflowService from '../services/workflow.service';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// ——— Templates (admin) ———
// GET /v1/workflows/templates
router.get(
  '/templates',
  authorize('workflows.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const activeOnly = req.query.active_only === 'true';
      const templates = await workflowService.listTemplates(tenantId, activeOnly);
      return res.json({ success: true, data: templates });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/workflows/templates
router.post(
  '/templates',
  authorize('workflows.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const { name, triggerType, description, isActive, steps } = req.body;
      if (!name || !triggerType || !Array.isArray(steps)) {
        throw new ApiError(400, 'name, triggerType, and steps (array) are required');
      }
      const template = await workflowService.createTemplate({
        tenantId,
        name,
        triggerType,
        description,
        isActive,
        steps,
      });
      return res.status(201).json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/workflows/templates/:id
router.get(
  '/templates/:id',
  authorize('workflows.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const template = await workflowService.getTemplate(tenantId, req.params.id);
      if (!template) throw new ApiError(404, 'Workflow template not found');
      return res.json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /v1/workflows/templates/:id
router.patch(
  '/templates/:id',
  authorize('workflows.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const updated = await workflowService.updateTemplate(tenantId, req.params.id, req.body);
      if (updated.count === 0) throw new ApiError(404, 'Workflow template not found');
      const template = await workflowService.getTemplate(tenantId, req.params.id);
      return res.json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }
);

// ——— Instances ———
// GET /v1/workflows/instances
router.get(
  '/instances',
  authorize('workflows.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const result = await workflowService.listInstances(tenantId, { status, limit, cursor });
      return res.json({
        success: true,
        data: result.instances,
        meta: { nextCursor: result.nextCursor },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/workflows/instances — Create instance (e.g. from time-off request)
router.post(
  '/instances',
  authorize('workflows.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const { templateId, resourceType, resourceId, firstApproverId } = req.body;
      if (!resourceType || !firstApproverId) {
        throw new ApiError(400, 'resourceType and firstApproverId are required');
      }
      const instance = await workflowService.createInstance({
        tenantId,
        templateId,
        resourceType,
        resourceId,
        initiatedBy: userId,
        firstApproverId,
      });
      return res.status(201).json({ success: true, data: instance });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/workflows/instances/:id/approve
router.post(
  '/instances/:id/approve',
  authorize('workflows.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const approverId = req.user!.userId;
      const { comments, nextApproverId } = req.body || {};
      const updated = await workflowService.approveStep({
        tenantId,
        instanceId: req.params.id,
        approverId,
        comments,
        nextApproverId,
      });
      if (!updated) throw new ApiError(404, 'Instance not found or you are not the current approver');
      return res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/workflows/instances/:id/reject
router.post(
  '/instances/:id/reject',
  authorize('workflows.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const approverId = req.user!.userId;
      const { comments } = req.body || {};
      const updated = await workflowService.rejectStep({
        tenantId,
        instanceId: req.params.id,
        approverId,
        comments,
      });
      if (!updated) throw new ApiError(404, 'Instance not found or you are not the current approver');
      return res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// ——— My Pending Approvals (approval inbox) ———
// GET /v1/me/workflows/pending — or we mount under /v1/workflows/me/pending
router.get(
  '/me/pending',
  authorize('workflows.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const approverId = req.user!.userId;
      const pending = await workflowService.listPendingApprovals(tenantId, approverId);
      return res.json({ success: true, data: pending });
    } catch (error) {
      next(error);
    }
  }
);

export const workflowsRouter = router;