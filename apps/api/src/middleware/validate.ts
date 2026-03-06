import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from './errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger();

// Validation middleware factory
export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      const result = schema.safeParse(data);
      
      if (!result.success) {
        const formattedErrors = result.error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }));
        
        logger.warn('Validation failed', { 
          source, 
          errors: formattedErrors 
        });
        
        throw new ApiError(400, 'Validation error');
      }
      
      // Replace request data with validated/parsed data
      req[source] = result.data;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new ApiError(400, 'Validation error'));
      } else {
        next(error);
      }
    }
  };
};

// Validate request body
export const validateBody = (schema: ZodSchema) => validate(schema, 'body');

// Validate query parameters
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query');

// Validate URL parameters
export const validateParams = (schema: ZodSchema) => validate(schema, 'params');
