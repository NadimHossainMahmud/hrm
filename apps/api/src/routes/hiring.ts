/**
 * Hiring & ATS API — Phase 5
 * Jobs, pipelines, applicants, scorecards, offers. Job limit enforced on create/publish.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { tenantContext } from '../middleware/tenantContext';
import { authorize } from '../middleware/authorize';
import { ApiError } from '../middleware/errorHandler';
import * as hiring from '../services/hiring.service';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// ——— Jobs ———
router.get(
  '/jobs',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const departmentId = typeof req.query.department_id === 'string' ? req.query.department_id : undefined;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const result = await hiring.listJobs(tenantId, { status, departmentId, limit, cursor });
      return res.json({ success: true, data: result.jobs, meta: { nextCursor: result.nextCursor } });
    } catch (e) {
      next(e);
    }
  }
);

router.get(
  '/jobs/:id',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await hiring.getJob(req.tenantId!, req.params.id);
      if (!job) throw new ApiError(404, 'Job not found');
      return res.json({ success: true, data: job });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/jobs',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await hiring.createJob(req.tenantId!, req.body);
      return res.status(201).json({ success: true, data: job });
    } catch (e) {
      next(e);
    }
  }
);

router.patch(
  '/jobs/:id',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await hiring.updateJob(req.tenantId!, req.params.id, req.body);
      if (!job) throw new ApiError(404, 'Job not found');
      return res.json({ success: true, data: job });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/jobs/:id/publish',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await hiring.publishJob(req.tenantId!, req.params.id);
      if (!job) throw new ApiError(404, 'Job not found');
      return res.json({ success: true, data: job });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/jobs/:id/close',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await hiring.closeJob(req.tenantId!, req.params.id);
      if (!job) throw new ApiError(404, 'Job not found');
      return res.json({ success: true, data: job });
    } catch (e) {
      next(e);
    }
  }
);

router.get(
  '/jobs/:jobId/applicants',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const result = await hiring.listApplicants(req.tenantId!, {
        jobPostingId: req.params.jobId,
        status,
        limit,
        cursor,
      });
      return res.json({ success: true, data: result.applicants, meta: { nextCursor: result.nextCursor } });
    } catch (e) {
      next(e);
    }
  }
);

// ——— Pipelines ———
router.get(
  '/pipelines',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await hiring.listPipelines(req.tenantId!);
      return res.json({ success: true, data: list });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/pipelines',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, isDefault } = req.body;
      if (!name) throw new ApiError(400, 'name is required');
      const pipeline = await hiring.createPipeline(req.tenantId!, name, !!isDefault);
      return res.status(201).json({ success: true, data: pipeline });
    } catch (e) {
      next(e);
    }
  }
);

router.get(
  '/pipelines/:id',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pipeline = await hiring.getPipeline(req.tenantId!, req.params.id);
      if (!pipeline) throw new ApiError(404, 'Pipeline not found');
      return res.json({ success: true, data: pipeline });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/pipelines/:id/stages',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, stageOrder, stageType, autoRejectDays } = req.body;
      if (!name || typeof stageOrder !== 'number') throw new ApiError(400, 'name and stageOrder required');
      const stage = await hiring.createStage(req.tenantId!, req.params.id, {
        name,
        stageOrder,
        stageType,
        autoRejectDays,
      });
      if (!stage) throw new ApiError(404, 'Pipeline not found');
      return res.status(201).json({ success: true, data: stage });
    } catch (e) {
      next(e);
    }
  }
);

// ——— Applicants ———
router.get(
  '/applicants',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobPostingId = typeof req.query.job_id === 'string' ? req.query.job_id : undefined;
      const stageId = typeof req.query.stage_id === 'string' ? req.query.stage_id : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const result = await hiring.listApplicants(req.tenantId!, {
        jobPostingId,
        stageId,
        status,
        limit,
        cursor,
      });
      return res.json({ success: true, data: result.applicants, meta: { nextCursor: result.nextCursor } });
    } catch (e) {
      next(e);
    }
  }
);

router.get(
  '/applicants/:id',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const applicant = await hiring.getApplicant(req.tenantId!, req.params.id);
      if (!applicant) throw new ApiError(404, 'Applicant not found');
      return res.json({ success: true, data: applicant });
    } catch (e) {
      next(e);
    }
  }
);

router.patch(
  '/applicants/:id/stage',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { stageId } = req.body;
      if (!stageId) throw new ApiError(400, 'stageId required');
      const applicant = await hiring.moveApplicantStage(req.tenantId!, req.params.id, stageId);
      if (!applicant) throw new ApiError(404, 'Applicant or stage not found');
      return res.json({ success: true, data: applicant });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/applicants/:id/reject',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body || {};
      const applicant = await hiring.rejectApplicant(req.tenantId!, req.params.id, reason);
      if (!applicant) throw new ApiError(404, 'Applicant not found');
      return res.json({ success: true, data: applicant });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/applicants/:id/hire',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startDate } = req.body;
      if (!startDate) throw new ApiError(400, 'startDate required');
      const result = await hiring.hireApplicant(req.tenantId!, req.params.id, new Date(startDate));
      return res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  }
);

// ——— Scorecards ———
router.get(
  '/applicants/:id/scorecards',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await hiring.listScorecards(req.tenantId!, req.params.id);
      return res.json({ success: true, data: list });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/applicants/:id/scorecards',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scorecard = await hiring.createScorecard(req.tenantId!, {
        ...req.body,
        applicantId: req.params.id,
      });
      return res.status(201).json({ success: true, data: scorecard });
    } catch (e) {
      next(e);
    }
  }
);

// ——— Offers ———
router.post(
  '/applicants/:id/offers',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const offer = await hiring.createOffer(req.tenantId!, req.params.id, req.body);
      return res.status(201).json({ success: true, data: offer });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/offers/:id/send',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const offer = await hiring.sendOffer(req.tenantId!, req.params.id);
      if (!offer) throw new ApiError(404, 'Offer not found');
      return res.json({ success: true, data: offer });
    } catch (e) {
      next(e);
    }
  }
);

export const hiringRouter = router;
