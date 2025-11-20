import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

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
 * This should integrate with Overlord's JWT authentication
 * For now, we'll create a basic version that can be enhanced
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

    // TODO: Integrate with Overlord's JWT verification
    // For now, this is a placeholder
    // In production, this should verify the JWT using the same secret as Overlord

    // Placeholder user data
    // In production, decode JWT and fetch user + organization data
    req.user = {
      id: 'placeholder-user-id',
      email: 'user@example.com',
      organization: {
        id: 'placeholder-org-id',
        name: 'Example Organization',
        tier: 'pro',
        member_role: 'admin',
      },
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
