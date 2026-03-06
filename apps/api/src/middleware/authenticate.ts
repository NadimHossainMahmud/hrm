import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../lib/jwt';
import { ApiError } from './errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger();

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// Extract token from Authorization header
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check cookies
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }
  
  return null;
};

// Authentication middleware
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new ApiError(401, 'Authentication required. Please provide a valid token.');
    }
    
    // Verify token
    const decoded = verifyAccessToken(token);
    
    // Attach user to request
    req.user = decoded;
    
    logger.debug('User authenticated', { userId: decoded.userId, tenantId: decoded.tenantId });
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(401, 'Invalid or expired token'));
    }
  }
};

// Optional authentication - doesn't throw if no token
export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const decoded = verifyAccessToken(token);
      req.user = decoded;
    }
    
    next();
  } catch {
    // Continue without user
    next();
  }
};
