import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger();

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

// Tenant context middleware
// Extracts tenant from JWT and sets up RLS context
export const tenantContext = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Tenant should be set from JWT by authenticate middleware
    if (!req.user?.tenantId) {
      throw new ApiError(403, 'Tenant context required');
    }
    
    // Set tenant ID on request for downstream use
    req.tenantId = req.user.tenantId;
    
    logger.debug('Tenant context set', { tenantId: req.tenantId });
    
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to validate tenant access
// Ensures the user can only access their own tenant's data
export const validateTenantAccess = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const requestedTenantId = req.params.tenantId || req.body.tenantId;
    
    // If no specific tenant requested, allow (will use JWT tenant)
    if (!requestedTenantId) {
      return next();
    }
    
    // Check if user has access to requested tenant
    if (req.user?.tenantId !== requestedTenantId) {
      throw new ApiError(403, 'Access denied to this tenant');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};
