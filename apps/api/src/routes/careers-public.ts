/**
 * Public careers API — Phase 5
 * No auth: list open jobs by tenant slug, get job, submit application, offer respond.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '../middleware/errorHandler';
import * as hiring from '../services/hiring.service';

const router = Router();

// POST /v1/public/careers/offers/:offerId/respond — Candidate accept/decline (must be before :tenantSlug)
router.post(
  '/offers/:offerId/respond',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { offerId } = req.params;
      const { accept, signatureUrl } = req.body ?? {};
      if (typeof accept !== 'boolean') throw new ApiError(400, 'accept (boolean) is required');
      const offer = await hiring.respondToOffer(offerId, accept, signatureUrl);
      if (!offer) throw new ApiError(404, 'Offer not found or already responded');
      return res.json({ success: true, data: offer });
    } catch (e) {
      next(e);
    }
  }
);

// GET /v1/public/careers/:tenantSlug — List open jobs
router.get(
  '/:tenantSlug',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await hiring.listOpenJobsByTenantSlug(req.params.tenantSlug);
      if (!result) throw new ApiError(404, 'Tenant not found');
      return res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  }
);

// GET /v1/public/careers/:tenantSlug/jobs/:jobId — Get job details
router.get(
  '/:tenantSlug/jobs/:jobId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await hiring.getOpenJobBySlug(req.params.tenantSlug, req.params.jobId);
      if (!result) throw new ApiError(404, 'Job not found');
      return res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  }
);

// POST /v1/public/careers/:tenantSlug/jobs/:jobId/apply — Submit application
router.post(
  '/:tenantSlug/jobs/:jobId/apply',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId, tenantSlug } = req.params;
      const job = await hiring.getOpenJobBySlug(tenantSlug, jobId);
      if (!job) throw new ApiError(404, 'Job not found');
      const tenantId = job.tenant.id;
      const { firstName, lastName, email, phone, resumeUrl, coverLetter, linkedinUrl, source, referralEmployeeId } = req.body;
      if (!firstName || !lastName || !email) {
        throw new ApiError(400, 'firstName, lastName, and email are required');
      }
      const applicant = await hiring.createApplicant(tenantId, job.job.id, {
        firstName,
        lastName,
        email,
        phone,
        resumeUrl,
        coverLetter,
        linkedinUrl,
        source: source || 'careers_page',
        referralEmployeeId,
      });
      return res.status(201).json({ success: true, data: applicant });
    } catch (e) {
      next(e);
    }
  }
);

export const careersPublicRouter = router;
