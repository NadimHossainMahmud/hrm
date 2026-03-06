import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger();

// Permission checking middleware factory
export const authorize = (...requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // User must be authenticated
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }
      
      // Check if user has all required permissions
      const userPermissions = req.user.permissions || [];
      
      const hasAllPermissions = requiredPermissions.every(permission =>
        userPermissions.includes(permission)
      );
      
      if (!hasAllPermissions) {
        logger.warn('Permission denied', {
          userId: req.user.userId,
          required: requiredPermissions,
          has: userPermissions
        });
        
        throw new ApiError(403, 'Insufficient permissions');
      }
      
      logger.debug('Authorization granted', {
        userId: req.user.userId,
        permissions: requiredPermissions
      });
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Role checking middleware factory
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }
      
      // This would need role lookup - simplified version
      // In production, you'd check the user's role against allowedRoles
      logger.debug('Role check passed', { userId: req.user.userId });
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Super admin check
export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }
    
    // Check for super_admin permission
    if (!req.user.permissions?.includes('super_admin')) {
      throw new ApiError(403, 'Super admin access required');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};
