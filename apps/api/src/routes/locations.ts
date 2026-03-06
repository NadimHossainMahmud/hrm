import { Router, Request, Response, NextFunction } from 'express';
import { locationSchema, locationUpdateSchema } from '@hrforge/shared';
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

// GET /v1/locations - List all locations
router.get(
  '/',
  authorize('locations.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;

      const locations = await prisma.location.findMany({
        where: { tenantId },
        include: {
          employees: {
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Format with employee count
      const formattedLocations = locations.map((loc: any) => ({
        ...loc,
        employeeCount: loc.employees.length,
        employees: undefined,
      }));

      res.status(200).json({
        success: true,
        data: { locations: formattedLocations },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/locations/:id - Get location by ID
router.get(
  '/:id',
  authorize('locations.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      const location = await prisma.location.findFirst({
        where: { id, tenantId },
        include: {
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

      if (!location) {
        throw new ApiError(404, 'Location not found');
      }

      res.status(200).json({
        success: true,
        data: { location },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/locations - Create location
router.post(
  '/',
  authorize('locations.write'),
  validateBody(locationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const data = req.body;

      // If setting as headquarters, unset other headquarters
      if (data.isHeadquarters) {
        await prisma.location.updateMany({
          where: { tenantId, isHeadquarters: true },
          data: { isHeadquarters: false },
        });
      }

      // Create location
      const location = await prisma.location.create({
        data: {
          ...data,
          tenantId,
        },
      });

      // Audit log
      auditLog({
        action: 'location:created',
        tableName: 'locations',
        recordId: location.id,
        newValues: data,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Location created', { locationId: location.id, tenantId });

      res.status(201).json({
        success: true,
        message: 'Location created successfully',
        data: { location },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /v1/locations/:id - Update location
router.patch(
  '/:id',
  authorize('locations.write'),
  validateBody(locationUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;
      const data = req.body;

      // Check if location exists
      const existingLocation = await prisma.location.findFirst({
        where: { id, tenantId },
      });

      if (!existingLocation) {
        throw new ApiError(404, 'Location not found');
      }

      // If setting as headquarters, unset other headquarters
      if (data.isHeadquarters && !existingLocation.isHeadquarters) {
        await prisma.location.updateMany({
          where: { tenantId, isHeadquarters: true },
          data: { isHeadquarters: false },
        });
      }

      // Update location
      const location = await prisma.location.update({
        where: { id },
        data,
      });

      // Audit log
      auditLog({
        action: 'location:updated',
        tableName: 'locations',
        recordId: id,
        oldValues: existingLocation ? JSON.parse(JSON.stringify(existingLocation)) : undefined,
        newValues: data ? JSON.parse(JSON.stringify(data)) : undefined,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Location updated', { locationId: id, tenantId });

      res.status(200).json({
        success: true,
        message: 'Location updated successfully',
        data: { location },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /v1/locations/:id - Delete location
router.delete(
  '/:id',
  authorize('locations.write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      // Check if location exists
      const existingLocation = await prisma.location.findFirst({
        where: { id, tenantId },
        include: {
          employees: { select: { id: true } },
        },
      });

      if (!existingLocation) {
        throw new ApiError(404, 'Location not found');
      }

      // Check if location has employees
      if (existingLocation.employees.length > 0) {
        throw new ApiError(400, 'Cannot delete location with employees. Reassign them first.');
      }

      // Delete location
      await prisma.location.delete({
        where: { id },
      });

      // Audit log
      auditLog({
        action: 'location:deleted',
        tableName: 'locations',
        recordId: id,
        oldValues: existingLocation ? JSON.parse(JSON.stringify(existingLocation)) : undefined,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      logger.info('Location deleted', { locationId: id, tenantId });

      res.status(200).json({
        success: true,
        message: 'Location deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export const locationsRouter = router;
