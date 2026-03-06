import { Router, Request, Response, NextFunction } from 'express';
import { 
  employeeSchema, 
  employeeUpdateSchema, 
  employeeFilterSchema,
} from '@hrforge/shared';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { tenantContext } from '../middleware/tenantContext';
import { authorize } from '../middleware/authorize';
import { validateBody, validateQuery } from '../middleware/validate';
import { ApiError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';
import { auditLog } from '../lib/events';

const logger = createLogger();
const router = Router();

// Apply authentication and tenant context to all routes
router.use(authenticate);
router.use(tenantContext);

// Helper to build employee include
const employeeInclude = {
  department: true,
  location: true,
  manager: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
    },
  },
  directReports: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
    },
  },
};

// GET /v1/employees - List employees with search/filter
router.get(
  '/',
  authorize('employees.read'),
  validateQuery(employeeFilterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const { 
        page, 
        limit, 
        search, 
        departmentId, 
        locationId, 
        managerId,
        employmentType, 
        status,
        sortBy,
        sortOrder 
      } = req.query as unknown as {
        page: number;
        limit: number;
        search?: string;
        departmentId?: string;
        locationId?: string;
        managerId?: string;
        employmentType?: string;
        status?: string;
        sortBy: string;
        sortOrder: 'asc' | 'desc';
      };

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        tenantId,
      };

      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { jobTitle: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (departmentId) where.departmentId = departmentId;
      if (locationId) where.locationId = locationId;
      if (managerId) where.managerId = managerId;
      if (employmentType) where.employmentType = employmentType;
      if (status) where.status = status;

      // Build order by
      const orderBy: any = {
        [sortBy]: sortOrder,
      };

      // Execute query
      const [employees, total] = await Promise.all([
        prisma.employee.findMany({
          where,
          include: employeeInclude,
          orderBy,
          skip,
          take: limit,
        }),
        prisma.employee.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          employees,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/employees/:id - Get employee by ID
router.get(
  '/:id',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      const employee = await prisma.employee.findFirst({
        where: { id, tenantId },
        include: employeeInclude,
      });

      if (!employee) {
        throw new ApiError(404, 'Employee not found');
      }

      res.status(200).json({
        success: true,
        data: { employee },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/employees - Create employee
router.post(
  '/',
  authorize('employees.write'),
  validateBody(employeeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const data = req.body;

      // Check if email already exists
      const existingEmployee = await prisma.employee.findUnique({
        where: { email: data.email },
      });

      if (existingEmployee) {
        throw new ApiError(409, 'Employee with this email already exists');
      }

      // Create employee
      const employee = await prisma.employee.create({
        data: {
          ...data,
          tenantId,
        },
        include: employeeInclude,
      });

      // Audit log
      auditLog({
        action: 'employee:created',
        tableName: 'employees',
        recordId: employee.id,
        newValues: data,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Employee created', { employeeId: employee.id, tenantId });

      res.status(201).json({
        success: true,
        message: 'Employee created successfully',
        data: { employee },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /v1/employees/:id - Update employee
router.patch(
  '/:id',
  authorize('employees.write'),
  validateBody(employeeUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const data = req.body;

      // Check if employee exists
      const existingEmployee = await prisma.employee.findFirst({
        where: { id, tenantId },
      });

      if (!existingEmployee) {
        throw new ApiError(404, 'Employee not found');
      }

      // Check email uniqueness if updating email
      if (data.email && data.email !== existingEmployee.email) {
        const emailExists = await prisma.employee.findUnique({
          where: { email: data.email },
        });
        if (emailExists) {
          throw new ApiError(409, 'Email already in use');
        }
      }

      // Update employee
      const employee = await prisma.employee.update({
        where: { id },
        data,
        include: employeeInclude,
      });

      // Audit log
      auditLog({
        action: 'employee:updated',
        tableName: 'employees',
        recordId: id,
        oldValues: existingEmployee ? JSON.parse(JSON.stringify(existingEmployee)) : undefined,
        newValues: data ? JSON.parse(JSON.stringify(data)) : undefined,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Employee updated', { employeeId: id, tenantId });

      res.status(200).json({
        success: true,
        message: 'Employee updated successfully',
        data: { employee },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /v1/employees/:id - Delete employee
router.delete(
  '/:id',
  authorize('employees.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      // Check if employee exists
      const existingEmployee = await prisma.employee.findFirst({
        where: { id, tenantId },
      });

      if (!existingEmployee) {
        throw new ApiError(404, 'Employee not found');
      }

      // Check if employee has direct reports
      const directReportsCount = await prisma.employee.count({
        where: { managerId: id },
      });

      if (directReportsCount > 0) {
        throw new ApiError(400, 'Cannot delete employee with direct reports. Reassign them first.');
      }

      // Delete employee
      await prisma.employee.delete({
        where: { id },
      });

      // Audit log
      auditLog({
        action: 'employee:deleted',
        tableName: 'employees',
        recordId: id,
        oldValues: existingEmployee ? JSON.parse(JSON.stringify(existingEmployee)) : undefined,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Employee deleted', { employeeId: id, tenantId });

      res.status(200).json({
        success: true,
        message: 'Employee deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/employees/directory/search - Employee directory search
router.get(
  '/directory/search',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const { q, limit = '20' } = req.query as { q?: string; limit?: string };

      const where: any = {
        tenantId,
        status: 'active',
      };

      if (q) {
        where.OR = [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { jobTitle: { contains: q, mode: 'insensitive' } },
        ];
      }

      const employees = await prisma.employee.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          jobTitle: true,
          department: {
            select: { id: true, name: true },
          },
          location: {
            select: { id: true, name: true },
          },
        },
        orderBy: { lastName: 'asc' },
        take: parseInt(limit),
      });

      res.status(200).json({
        success: true,
        data: { employees },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/employees/:id/org-chart - Get org chart for employee
router.get(
  '/:id/org-chart',
  authorize('employees.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      const employee = await prisma.employee.findFirst({
        where: { id, tenantId },
        include: {
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              jobTitle: true,
            },
          },
          directReports: {
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

      if (!employee) {
        throw new ApiError(404, 'Employee not found');
      }

      res.status(200).json({
        success: true,
        data: {
          employee,
          manager: employee.manager,
          directReports: employee.directReports,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export const employeesRouter = router;
