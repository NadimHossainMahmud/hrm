/**
 * Hiring & ATS service — Phase 5
 * Job limit enforcement (Core: 5, Pro: 25, Elite: 50), CRUD, hire conversion.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger();

const OPEN_STATUSES = ['open', 'paused'] as const; // published jobs that count toward limit

/** Get tenant's max open jobs from plan (maxJobs). */
export async function getJobLimit(tenantId: string): Promise<number> {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!sub?.plan?.maxJobs) return 5; // default Core
  return sub.plan.maxJobs;
}

/** Count jobs that count toward limit (open + paused). */
export async function countOpenJobs(tenantId: string): Promise<number> {
  return prisma.jobPosting.count({
    where: {
      tenantId,
      status: { in: [...OPEN_STATUSES] },
    },
  });
}

/** Assert tenant can create or publish one more job. */
export async function assertJobLimit(tenantId: string): Promise<void> {
  const [limit, current] = await Promise.all([getJobLimit(tenantId), countOpenJobs(tenantId)]);
  if (current >= limit) {
    throw new ApiError(
      403,
      `Job limit reached (${current}/${limit}). Upgrade your plan to post more jobs.`
    );
  }
}

// ——— Job postings ———
/** Public: list open jobs by tenant slug (careers page). */
export async function listOpenJobsByTenantSlug(slug: string, limit = 50) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug, status: 'active' },
  });
  if (!tenant) return null;
  const jobs = await prisma.jobPosting.findMany({
    where: { tenantId: tenant.id, status: 'open' },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  });
  return { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, jobs };
}

/** Public: get single open job by tenant slug and job id. */
export async function getOpenJobBySlug(tenantSlug: string, jobId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug, status: 'active' },
  });
  if (!tenant) return null;
  const job = await prisma.jobPosting.findFirst({
    where: { id: jobId, tenantId: tenant.id, status: 'open' },
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  });
  return job ? { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, job } : null;
}

export async function listJobs(
  tenantId: string,
  opts: { status?: string; departmentId?: string; limit?: number; cursor?: string } = {}
) {
  const { status, departmentId, limit = 20, cursor } = opts;
  const where: Prisma.JobPostingWhereInput = { tenantId };
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;

  const items = await prisma.jobPosting.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      hiringManager: { select: { id: true, firstName: true, lastName: true, email: true } },
      pipeline: { select: { id: true, name: true } },
    },
  });
  const hasMore = items.length > limit;
  const list = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? list[list.length - 1].id : null;
  return { jobs: list, nextCursor };
}

export async function getJob(tenantId: string, jobId: string) {
  const job = await prisma.jobPosting.findFirst({
    where: { id: jobId, tenantId },
    include: {
      department: true,
      location: true,
      hiringManager: true,
      pipeline: { include: { stages: { orderBy: { stageOrder: 'asc' } } } },
    },
  });
  return job;
}

export async function createJob(tenantId: string, data: Prisma.JobPostingUncheckedCreateInput) {
  await assertJobLimit(tenantId);
  return prisma.jobPosting.create({
    data: { ...data, tenantId },
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      hiringManager: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function updateJob(
  tenantId: string,
  jobId: string,
  data: Prisma.JobPostingUncheckedUpdateInput
) {
  return prisma.jobPosting.updateMany({
    where: { id: jobId, tenantId },
    data,
  }).then((r) => {
    if (r.count === 0) return null;
    return getJob(tenantId, jobId);
  });
}

export async function publishJob(tenantId: string, jobId: string) {
  const job = await prisma.jobPosting.findFirst({ where: { id: jobId, tenantId } });
  if (!job) return null;
  if (job.status === 'open' || job.status === 'paused') return getJob(tenantId, jobId);
  await assertJobLimit(tenantId);
  await prisma.jobPosting.update({
    where: { id: jobId },
    data: { status: 'open', publishedAt: new Date() },
  });
  return getJob(tenantId, jobId);
}

export async function closeJob(tenantId: string, jobId: string) {
  const updated = await prisma.jobPosting.updateMany({
    where: { id: jobId, tenantId },
    data: { status: 'closed' },
  });
  return updated.count > 0 ? getJob(tenantId, jobId) : null;
}

// ——— Pipelines ———
export async function listPipelines(tenantId: string) {
  return prisma.hiringPipeline.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: { stages: { orderBy: { stageOrder: 'asc' } } },
  });
}

export async function createPipeline(tenantId: string, name: string, isDefault = false) {
  if (isDefault) {
    await prisma.hiringPipeline.updateMany({ where: { tenantId }, data: { isDefault: false } });
  }
  return prisma.hiringPipeline.create({
    data: { tenantId, name, isDefault },
    include: { stages: true },
  });
}

export async function getPipeline(tenantId: string, pipelineId: string) {
  return prisma.hiringPipeline.findFirst({
    where: { id: pipelineId, tenantId },
    include: { stages: { orderBy: { stageOrder: 'asc' } } },
  });
}

export async function createStage(
  tenantId: string,
  pipelineId: string,
  data: { name: string; stageOrder: number; stageType?: string; autoRejectDays?: number }
) {
  const pipeline = await getPipeline(tenantId, pipelineId);
  if (!pipeline) return null;
  return prisma.pipelineStage.create({
    data: { pipelineId, ...data },
  });
}

// ——— Applicants ———
export async function listApplicants(
  tenantId: string,
  opts: {
    jobPostingId?: string;
    stageId?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  } = {}
) {
  const { jobPostingId, stageId, status, limit = 20, cursor } = opts;
  const where: Prisma.ApplicantWhereInput = { tenantId };
  if (jobPostingId) where.jobPostingId = jobPostingId;
  if (stageId) where.currentStageId = stageId;
  if (status) where.status = status;

  const items = await prisma.applicant.findMany({
    where,
    orderBy: { appliedAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      jobPosting: { select: { id: true, title: true, status: true } },
      currentStage: true,
      referralEmployee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const hasMore = items.length > limit;
  return { applicants: hasMore ? items.slice(0, limit) : items, nextCursor: hasMore ? items[limit - 1].id : null };
}

export async function getApplicant(tenantId: string, applicantId: string) {
  return prisma.applicant.findFirst({
    where: { id: applicantId, tenantId },
    include: {
      jobPosting: { include: { department: true, location: true } },
      currentStage: true,
      referralEmployee: true,
      scorecards: { include: { interviewer: { select: { id: true, firstName: true, lastName: true } } } },
      offerLetters: true,
    },
  });
}

export async function createApplicant(tenantId: string, jobPostingId: string, data: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  resumeUrl?: string;
  coverLetter?: string;
  linkedinUrl?: string;
  source?: string;
  referralEmployeeId?: string;
}) {
  const job = await prisma.jobPosting.findFirst({
    where: { id: jobPostingId, tenantId, status: 'open' },
    include: { pipeline: { include: { stages: { orderBy: { stageOrder: 'asc' } } } } },
  });
  if (!job) throw new ApiError(404, 'Job posting not found or not open for applications');

  const firstStage = job.pipeline?.stages?.[0];
  return prisma.applicant.create({
    data: {
      tenantId,
      jobPostingId,
      ...data,
      currentStageId: firstStage?.id ?? null,
    },
    include: {
      jobPosting: { select: { id: true, title: true } },
      currentStage: true,
    },
  });
}

export async function moveApplicantStage(
  tenantId: string,
  applicantId: string,
  stageId: string
) {
  const applicant = await prisma.applicant.findFirst({
    where: { id: applicantId, tenantId },
    include: { jobPosting: { include: { pipeline: true } } },
  });
  if (!applicant) return null;
  const pipelineId = applicant.jobPosting?.pipelineId;
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId: pipelineId ?? undefined },
  });
  if (!stage) return null;
  await prisma.applicant.update({
    where: { id: applicantId },
    data: { currentStageId: stageId, updatedAt: new Date() },
  });
  return getApplicant(tenantId, applicantId);
}

export async function rejectApplicant(
  tenantId: string,
  applicantId: string,
  reason?: string
) {
  const updated = await prisma.applicant.updateMany({
    where: { id: applicantId, tenantId },
    data: { status: 'rejected', rejectionReason: reason ?? null, currentStageId: null },
  });
  return updated.count > 0 ? getApplicant(tenantId, applicantId) : null;
}

/** Convert accepted applicant to employee. */
export async function hireApplicant(tenantId: string, applicantId: string, startDate: Date) {
  const applicant = await prisma.applicant.findFirst({
    where: { id: applicantId, tenantId },
    include: { jobPosting: true },
  });
  if (!applicant) throw new ApiError(404, 'Applicant not found');
  if (applicant.status === 'hired') throw new ApiError(400, 'Applicant already hired');

  const employee = await prisma.employee.create({
    data: {
      tenantId,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      email: applicant.email,
      phone: applicant.phone ?? undefined,
      startDate,
      employmentType: applicant.jobPosting?.employmentType ?? 'full_time',
      jobTitle: applicant.jobPosting?.title ?? 'New Hire',
      status: 'active',
    },
  });

  await prisma.applicant.update({
    where: { id: applicantId },
    data: { status: 'hired', hiredDate: startDate },
  });

  logger.info('Applicant hired as employee', { applicantId, employeeId: employee.id });
  return { employee, applicant };
}

// ——— Scorecards ———
export async function listScorecards(tenantId: string, applicantId: string) {
  return prisma.interviewScorecard.findMany({
    where: { tenantId, applicantId },
    orderBy: { createdAt: 'desc' },
    include: { interviewer: { select: { id: true, firstName: true, lastName: true } }, stage: true },
  });
}

export async function createScorecard(
  tenantId: string,
  data: {
    applicantId: string;
    interviewerId: string;
    stageId?: string;
    overallRating?: number;
    recommendation?: string;
    notes?: string;
    scores?: Prisma.JsonObject;
  }
) {
  return prisma.interviewScorecard.create({
    data: { ...data, tenantId },
    include: { applicant: { select: { id: true, firstName: true, lastName: true } }, interviewer: true },
  });
}

// ——— Offer letters ———
export async function createOffer(
  tenantId: string,
  applicantId: string,
  data: { templateId?: string; content?: string; salary?: number; startDate?: Date }
) {
  const applicant = await prisma.applicant.findFirst({
    where: { id: applicantId, tenantId },
  });
  if (!applicant) throw new ApiError(404, 'Applicant not found');
  return prisma.offerLetter.create({
    data: { tenantId, applicantId, ...data },
    include: { applicant: true },
  });
}

export async function sendOffer(tenantId: string, offerId: string) {
  const offer = await prisma.offerLetter.findFirst({
    where: { id: offerId, tenantId },
  });
  if (!offer) return null;
  await prisma.offerLetter.update({
    where: { id: offerId },
    data: { status: 'sent', sentAt: new Date(), expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  });
  return prisma.offerLetter.findUnique({
    where: { id: offerId },
    include: { applicant: true },
  });
}

export async function respondToOffer(
  offerId: string,
  accept: boolean,
  signatureUrl?: string
) {
  const offer = await prisma.offerLetter.findUnique({
    where: { id: offerId },
  });
  if (!offer) return null;
  if (offer.status !== 'sent') return null;
  await prisma.offerLetter.update({
    where: { id: offerId },
    data: {
      status: accept ? 'accepted' : 'declined',
      respondedAt: new Date(),
      ...(signatureUrl && { signatureUrl }),
    },
  });
  return prisma.offerLetter.findUnique({
    where: { id: offerId },
    include: { applicant: true },
  });
}
