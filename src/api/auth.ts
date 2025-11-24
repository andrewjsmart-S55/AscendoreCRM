import { Router, Request, Response } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { logger } from '../utils/logger';
import { z } from 'zod';

export const authRouter = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  company_name: z.string().min(1, 'Company name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const updatePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'New password must be at least 8 characters'),
});

/**
 * POST /auth/register
 * Register a new user and organization
 */
authRouter.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body);

    const pool = getPool();
    const authService = new AuthService(pool);

    const { user, token } = await authService.register(data);

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        },
        token,
      },
      message: 'Registration successful',
    });
  })
);

/**
 * POST /auth/login
 * Authenticate user and return JWT token
 */
authRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const data = loginSchema.parse(req.body);

    const pool = getPool();
    const authService = new AuthService(pool);

    const { user, token } = await authService.login(data);

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        },
        token,
      },
      message: 'Login successful',
    });
  })
);

/**
 * GET /auth/me
 * Get current authenticated user
 */
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
        },
        organization: req.user.organization,
      },
    });
  })
);

/**
 * PUT /auth/password
 * Update user password
 */
authRouter.put(
  '/password',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const data = updatePasswordSchema.parse(req.body);

    const pool = getPool();
    const authService = new AuthService(pool);

    await authService.updatePassword(
      req.user.id,
      data.current_password,
      data.new_password
    );

    logger.info('Password updated successfully', {
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: 'Password updated successfully',
    });
  })
);

/**
 * POST /auth/logout
 * Logout (client-side token removal)
 * This is mainly for consistency - JWT logout happens client-side
 */
authRouter.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    // With JWT, logout is handled client-side by removing the token
    // This endpoint exists for API consistency and logging purposes

    if (req.headers.authorization) {
      logger.info('User logged out');
    }

    res.json({
      success: true,
      message: 'Logout successful',
    });
  })
);
