import { Router, Request, Response, NextFunction } from 'express';
import { departmentSchema, departmentUpdateSchema } from '@hrforge/shared';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { tenantContext } from '../middleware/tenantContext';
import { authorize } from '../middleware/authorize';
import { validateBody } from '../middleware/validate';
import { ApiError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';
import { auditLog } from '../lib/events';

const logger = createLogger();
const router = Router();

// Apply authentication and tenant context to all routes
router.use(authenticate);
router.use(tenantContext);

// GET /v1/departments - List all departments
router.get(
  '/',
  authorize('departments.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;

      const departments = await prisma.department.findMany({
        where: { tenantId },
        include: {
          parent: {
            select: { id: true, name: true },
          },
          children: {
            select: { id: true, name: true },
          },
          employees: {
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Format response with employee count
      const formattedDepartments = departments.map((dept: any) => ({
        ...dept,
        employeeCount: dept.employees.length,
        employees: undefined,
      }));

      res.status(200).json({
        success: true,
        data: { departments: formattedDepartments },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/departments/tree - Get department hierarchy
router.get(
  '/tree',
  authorize('departments.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;

      const departments = await prisma.department.findMany({
        where: { tenantId },
        include: {
          employees: {
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Build tree structure
      const buildTree = (parentId: string | null = null): any[] => {
        return departments
          .filter((dept: any) => dept.parentId === parentId)
          .map((dept: any) => ({
            id: dept.id,
            name: dept.name,
            description: dept.description,
            employeeCount: dept.employees.length,
            children: buildTree(dept.id),
          }));
      };

      const tree = buildTree();

      res.status(200).json({
        success: true,
        data: { tree },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/departments/:id - Get department by ID
router.get(
  '/:id',
  authorize('departments.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      const department = await prisma.department.findFirst({
        where: { id, tenantId },
        include: {
          parent: {
            select: { id: true, name: true },
          },
          children: {
            select: { id: true, name: true },
          },
          employees: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              jobTitle: true,
            },
          },
        },
      });

      if (!department) {
        throw new ApiError(404, 'Department not found');
      }

      res.status(200).json({
        success: true,
        data: { department },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/departments - Create department
router.post(
  '/',
  authorize('departments.write'),
  validateBody(departmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const data = req.body;

      // Validate parent department if provided
      if (data.parentId) {
        const parentDept = await prisma.department.findFirst({
          where: { id: data.parentId, tenantId },
        });
        if (!parentDept) {
          throw new ApiError(400, 'Parent department not found');
        }
      }

      // Create department
      const department = await prisma.department.create({
        data: {
          ...data,
          tenantId,
        },
        include: {
          parent: {
            select: { id: true, name: true },
          },
        },
      });

      // Audit log
      auditLog({
        action: 'department:created',
        tableName: 'departments',
        recordId: department.id,
        newValues: data,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Department created', { departmentId: department.id, tenantId });

      res.status(201).json({
        success: true,
        message: 'Department created successfully',
        data: { department },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /v1/departments/:id - Update department
router.patch(
  '/:id',
  authorize('departments.write'),
  validateBody(departmentUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const data = req.body;

      // Check if department exists
      const existingDept = await prisma.department.findFirst({
        where: { id, tenantId },
      });

      if (!existingDept) {
        throw new ApiError(404, 'Department not found');
      }

      // Validate parent department if provided
      if (data.parentId) {
        if (data.parentId === id) {
          throw new ApiError(400, 'Department cannot be its own parent');
        }
        const parentDept = await prisma.department.findFirst({
          where: { id: data.parentId, tenantId },
        });
        if (!parentDept) {
          throw new ApiError(400, 'Parent department not found');
        }
      }

      // Update department
      const department = await prisma.department.update({
        where: { id },
        data,
        include: {
          parent: {
            select: { id: true, name: true },
          },
        },
      });

      // Audit log
      auditLog({
        action: 'department:updated',
        tableName: 'departments',
        recordId: id,
        oldValues: existingDept ? JSON.parse(JSON.stringify(existingDept)) : undefined,
        newValues: data ? JSON.parse(JSON.stringify(data)) : undefined,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Department updated', { departmentId: id, tenantId });

      res.status(200).json({
        success: true,
        message: 'Department updated successfully',
        data: { department },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /v1/departments/:id - Delete department
router.delete(
  '/:id',
  authorize('departments.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      // Check if department exists
      const existingDept = await prisma.department.findFirst({
        where: { id, tenantId },
        include: {
          employees: { select: { id: true } },
          children: { select: { id: true } },
        },
      });

      if (!existingDept) {
        throw new ApiError(404, 'Department not found');
      }

      // Check if department has employees
      if (existingDept.employees.length > 0) {
        throw new ApiError(400, 'Cannot delete department with employees. Reassign them first.');
      }

      // Check if department has children
      if (existingDept.children.length > 0) {
        throw new ApiError(400, 'Cannot delete department with sub-departments. Move them first.');
      }

      // Delete department
      await prisma.department.delete({
        where: { id },
      });

      // Audit log
      auditLog({
        action: 'department:deleted',
        tableName: 'departments',
        recordId: id,
        oldValues: existingDept ? JSON.parse(JSON.stringify(existingDept)) : undefined,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Department deleted', { departmentId: id, tenantId });

      res.status(200).json({
        success: true,
        message: 'Department deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export const departmentsRouter = router;
