import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { AuthService } from '../services/authService';
import { getPool } from '../database/connection';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
    organization?: {
      id: string;
      name: string;
      tier: string;
      member_role: string;
    };
  };
}

/**
 * Authentication middleware
 * Verifies JWT token and loads user + organization data
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No authentication token provided', 401);
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const pool = getPool();
    const authService = new AuthService(pool);

    const payload = authService.verifyToken(token);

    // Get full user data with organization
    const userData = await authService.getUserById(payload.user.id);

    if (!userData) {
      throw new AppError('User not found or inactive', 401);
    }

    // Attach user data to request
    req.user = {
      id: userData.user.id,
      email: userData.user.email,
      organization: userData.organization,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Require specific organization role
 */
export const requireOrganizationRole = (requiredRole: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.organization) {
      return next(new AppError('Organization context required', 403));
    }

    const roleHierarchy: Record<string, number> = {
      viewer: 1,
      billing: 2,
      member: 3,
      admin: 4,
      owner: 5,
    };

    const userRoleLevel = roleHierarchy[req.user.organization.member_role] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

    if (userRoleLevel < requiredRoleLevel) {
      return next(
        new AppError(
          `Insufficient permissions. Required role: ${requiredRole}`,
          403
        )
      );
    }

    next();
  };
};

/**
 * Load organization context from header
 */
export const loadOrganizationContext = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const organizationId = req.headers['x-organization-id'] as string;

  if (organizationId && req.user) {
    // Verify user has access to this organization
    // This should query the database to verify membership
    req.user.organization = {
      ...req.user.organization!,
      id: organizationId,
    };
  }

  next();
};
