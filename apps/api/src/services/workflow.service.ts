/**
 * Workflow execution engine — Phase 4
 * Templates, instances, approve/reject, advance steps.
 */
import { prisma } from '../lib/prisma';
import { notify } from './notification.service';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface WorkflowStep {
  order: number;
  approverType: 'role' | 'user' | 'manager';
  approverId?: string;
  roleId?: string;
  autoApproveDays?: number;
  condition?: string;
}

export interface WorkflowTemplateInput {
  tenantId: string;
  name: string;
  triggerType: string;
  description?: string;
  isActive?: boolean;
  steps: WorkflowStep[];
}

/**
 * Create workflow template.
 */
export async function createTemplate(input: WorkflowTemplateInput) {
  const steps = input.steps as unknown as WorkflowStep[];
  return prisma.workflowTemplate.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      triggerType: input.triggerType,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      steps: steps as object,
    },
  });
}

/**
 * List workflow templates for tenant.
 */
export async function listTemplates(tenantId: string, activeOnly?: boolean) {
  return prisma.workflowTemplate.findMany({
    where: {
      tenantId,
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Get template by id.
 */
export async function getTemplate(tenantId: string, templateId: string) {
  return prisma.workflowTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
}

/**
 * Update template.
 */
export async function updateTemplate(
  tenantId: string,
  templateId: string,
  data: Partial<Pick<WorkflowTemplateInput, 'name' | 'triggerType' | 'description' | 'isActive' | 'steps'>>
) {
  return prisma.workflowTemplate.updateMany({
    where: { id: templateId, tenantId },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.triggerType != null && { triggerType: data.triggerType }),
      ...(data.description != null && { description: data.description }),
      ...(data.isActive != null && { isActive: data.isActive }),
      ...(data.steps != null && { steps: data.steps as object }),
    },
  });
}

/**
 * Create workflow instance from template (or ad-hoc). Advance to first step and create first approval.
 */
export async function createInstance(params: {
  tenantId: string;
  templateId?: string;
  resourceType: string;
  resourceId?: string;
  initiatedBy: string;
  firstApproverId: string; // resolved from template step 0 (e.g. manager)
}) {
  const { tenantId, templateId, resourceType, resourceId, initiatedBy, firstApproverId } = params;

  const instance = await prisma.workflowInstance.create({
    data: {
      tenantId,
      templateId: templateId ?? null,
      resourceType,
      resourceId: resourceId ?? null,
      initiatedBy,
      status: 'in_progress',
      currentStep: 1,
    },
  });

  await prisma.workflowApproval.create({
    data: {
      instanceId: instance.id,
      tenantId,
      stepOrder: 1,
      approverId: firstApproverId,
      status: 'pending',
    },
  });

  // Notify approver
  await notify({
    tenantId,
    userId: firstApproverId,
    type: 'workflow_approval_required',
    title: 'Approval required',
    message: `You have a pending approval for ${resourceType}.`,
    resourceType: 'workflow_instance',
    resourceId: instance.id,
    channel: 'both',
  });

  logger.info('Workflow instance created', {
    instanceId: instance.id,
    resourceType,
    initiatedBy,
    approverId: firstApproverId,
  });

  return instance;
}

/**
 * Get current pending approval for an instance (for current step).
 */
function getCurrentApprovalRecord(approvals: { stepOrder: number; approverId: string; status: string }[]) {
  const pending = approvals
    .filter((a) => a.status === 'pending')
    .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  return pending;
}

/**
 * Approve current step. If there are more steps, create next approval and notify. Else complete instance.
 */
export async function approveStep(params: {
  tenantId: string;
  instanceId: string;
  approverId: string;
  comments?: string;
  nextApproverId?: string; // For multi-step: who approves next. In full impl, resolve from template.
}) {
  const { tenantId, instanceId, approverId, comments, nextApproverId } = params;

  const instance = await prisma.workflowInstance.findFirst({
    where: { id: instanceId, tenantId },
    include: { approvals: true },
  });

  if (!instance) {
    return null;
  }
  if (instance.status !== 'in_progress' && instance.status !== 'pending') {
    return null;
  }

  const currentApproval = getCurrentApprovalRecord(instance.approvals);
  if (!currentApproval || currentApproval.approverId !== approverId) {
    return null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflowApproval.updateMany({
      where: {
        instanceId,
        stepOrder: currentApproval.stepOrder,
        approverId,
      },
      data: { status: 'approved', decisionAt: new Date(), comments: comments ?? null },
    });

    const template = instance.templateId
      ? await tx.workflowTemplate.findUnique({ where: { id: instance.templateId } })
      : null;
    const steps = (template?.steps as WorkflowStep[] | null) ?? [];
    const nextStep = steps.find((s) => s.order === instance.currentStep + 1);

    if (nextStep && nextApproverId) {
      await tx.workflowInstance.update({
        where: { id: instanceId },
        data: { currentStep: instance.currentStep + 1 },
      });
      await tx.workflowApproval.create({
        data: {
          instanceId,
          tenantId,
          stepOrder: instance.currentStep + 1,
          approverId: nextApproverId,
          status: 'pending',
        },
      });
      await notify({
        tenantId,
        userId: nextApproverId,
        type: 'workflow_approval_required',
        title: 'Approval required',
        message: `You have a pending approval for ${instance.resourceType}.`,
        resourceType: 'workflow_instance',
        resourceId: instanceId,
        channel: 'both',
      });
    } else {
      await tx.workflowInstance.update({
        where: { id: instanceId },
        data: { status: 'approved', completedAt: new Date() },
      });
      await notify({
        tenantId,
        userId: instance.initiatedBy,
        type: 'workflow_approved',
        title: 'Request approved',
        message: `Your ${instance.resourceType} request has been approved.`,
        resourceType: 'workflow_instance',
        resourceId: instanceId,
        channel: 'both',
      });
    }
  });

  return prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: { approvals: true },
  });
}

/**
 * Reject current step. Complete instance as rejected.
 */
export async function rejectStep(params: {
  tenantId: string;
  instanceId: string;
  approverId: string;
  comments?: string;
}) {
  const { tenantId, instanceId, approverId, comments } = params;

  const instance = await prisma.workflowInstance.findFirst({
    where: { id: instanceId, tenantId },
    include: { approvals: true },
  });

  if (!instance) return null;
  if (instance.status !== 'in_progress' && instance.status !== 'pending') return null;

  const currentApproval = getCurrentApprovalRecord(instance.approvals);
  if (!currentApproval || currentApproval.approverId !== approverId) return null;

  await prisma.$transaction(async (tx) => {
    await tx.workflowApproval.updateMany({
      where: {
        instanceId,
        stepOrder: currentApproval.stepOrder,
        approverId,
      },
      data: { status: 'rejected', decisionAt: new Date(), comments: comments ?? null },
    });
    await tx.workflowInstance.update({
      where: { id: instanceId },
      data: { status: 'rejected', completedAt: new Date() },
    });
  });

  await notify({
    tenantId,
    userId: instance.initiatedBy,
    type: 'workflow_rejected',
    title: 'Request rejected',
    message: comments || `Your ${instance.resourceType} request has been rejected.`,
    resourceType: 'workflow_instance',
    resourceId: instanceId,
    channel: 'both',
  });

  return prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: { approvals: true },
  });
}

/**
 * List pending approvals for a user (approval inbox).
 */
export async function listPendingApprovals(tenantId: string, approverId: string) {
  const approvals = await prisma.workflowApproval.findMany({
    where: {
      tenantId,
      approverId,
      status: 'pending',
    },
    include: {
      instance: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          template: { select: { name: true, triggerType: true } },
        },
      },
    },
    orderBy: { instance: { createdAt: 'desc' } },
  });

  return approvals.map((a) => ({
    id: a.id,
    instanceId: a.instanceId,
    stepOrder: a.stepOrder,
    resourceType: a.instance.resourceType,
    resourceId: a.instance.resourceId,
    initiatedBy: a.instance.initiatedBy,
    initiator: a.instance.user,
    templateName: a.instance.template?.name,
    triggerType: a.instance.template?.triggerType,
    createdAt: a.instance.createdAt,
  }));
}

/**
 * List workflow instances for tenant (admin view).
 */
export async function listInstances(
  tenantId: string,
  options: { status?: string; limit?: number; cursor?: string } = {}
) {
  const { status, limit = 20, cursor } = options;
  const where = { tenantId, ...(status ? { status } : {}) };

  const instances = await prisma.workflowInstance.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      template: { select: { name: true, triggerType: true } },
      approvals: true,
    },
  });

  const hasMore = instances.length > limit;
  const list = hasMore ? instances.slice(0, limit) : instances;
  const nextCursor = hasMore ? list[list.length - 1].id : null;

  return { instances: list, nextCursor };
}
