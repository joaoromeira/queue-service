import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  isAuthenticated?: boolean;
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-token'] as string;

  if (!token) {
    logger.warn('Authentication attempt without token', { 
      ip: req.ip, 
      path: req.path,
      method: req.method 
    });
    res.status(401).json({ 
      error: 'Authentication required', 
      message: 'Please provide a valid API token' 
    });
    return;
  }

  if (token !== config.auth.apiToken) {
    logger.warn('Authentication attempt with invalid token', { 
      ip: req.ip, 
      path: req.path,
      method: req.method 
    });
    res.status(401).json({ 
      error: 'Invalid token', 
      message: 'The provided API token is invalid' 
    });
    return;
  }

  req.isAuthenticated = true;
  logger.debug('Successful authentication', { 
    ip: req.ip, 
    path: req.path,
    method: req.method 
  });
  
  next();
};

// Optional middleware for endpoints that don't require authentication
export const optionalAuthMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-token'] as string;

  if (token && token === config.auth.apiToken) {
    req.isAuthenticated = true;
  } else {
    req.isAuthenticated = false;
  }

  next();
}; 