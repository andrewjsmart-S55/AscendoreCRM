import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
}

export interface AuthOrganization {
  id: string;
  name: string;
  tier: string;
  member_role: string;
}

export interface TokenPayload {
  user: {
    id: string;
    email: string;
  };
  organization: AuthOrganization;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  company_name: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export class AuthService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Compare a password with its hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT token
   */
  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as TokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Token has expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid token', 401);
      }
      throw new AppError('Token verification failed', 401);
    }
  }

  /**
   * Register a new user and organization
   */
  async register(data: RegisterData): Promise<{ user: AuthUser; token: string }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if email already exists
      const emailCheck = await client.query(
        'SELECT id FROM public.users WHERE email = $1',
        [data.email]
      );

      if (emailCheck.rows.length > 0) {
        throw new AppError('Email already registered', 409);
      }

      // Hash password
      const passwordHash = await this.hashPassword(data.password);

      // Create company (organization)
      const companySlug = data.company_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const companyResult = await client.query(
        `INSERT INTO public.companies (name, slug, settings, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, name`,
        [data.company_name, companySlug, '{}', '{}']
      );

      const company = companyResult.rows[0];

      // Create user
      const userResult = await client.query(
        `INSERT INTO public.users (email, first_name, last_name, password_hash, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, email, first_name, last_name, is_active`,
        [data.email, data.first_name, data.last_name, passwordHash, true]
      );

      const user = userResult.rows[0];

      // Link user to company as owner
      await client.query(
        `INSERT INTO public.company_users (company_id, user_id, role, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [company.id, user.id, 'owner']
      );

      await client.query('COMMIT');

      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
        companyId: company.id,
      });

      // Generate token
      const token = this.generateToken({
        user: {
          id: user.id,
          email: user.email,
        },
        organization: {
          id: company.id,
          name: company.name,
          tier: 'free', // Default tier
          member_role: 'owner',
        },
      });

      return { user, token };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Registration failed', { error });
      throw new AppError('Registration failed', 500);
    } finally {
      client.release();
    }
  }

  /**
   * Authenticate a user and generate token
   */
  async login(data: LoginData): Promise<{ user: AuthUser; token: string }> {
    try {
      // Find user by email
      const userResult = await this.pool.query(
        `SELECT id, email, first_name, last_name, password_hash, is_active
         FROM public.users
         WHERE email = $1`,
        [data.email]
      );

      if (userResult.rows.length === 0) {
        throw new AppError('Invalid email or password', 401);
      }

      const user = userResult.rows[0];

      // Check if user is active
      if (!user.is_active) {
        throw new AppError('Account is inactive', 403);
      }

      // Verify password
      if (!user.password_hash) {
        throw new AppError('Password not set for this account', 401);
      }

      const isPasswordValid = await this.comparePassword(data.password, user.password_hash);

      if (!isPasswordValid) {
        throw new AppError('Invalid email or password', 401);
      }

      // Get user's primary organization
      const orgResult = await this.pool.query(
        `SELECT c.id, c.name, cu.role
         FROM public.company_users cu
         JOIN public.companies c ON cu.company_id = c.id
         WHERE cu.user_id = $1 AND c.deleted_at IS NULL
         ORDER BY cu.created_at ASC
         LIMIT 1`,
        [user.id]
      );

      if (orgResult.rows.length === 0) {
        throw new AppError('No organization found for this user', 403);
      }

      const organization = orgResult.rows[0];

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        organizationId: organization.id,
      });

      // Generate token
      const token = this.generateToken({
        user: {
          id: user.id,
          email: user.email,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          tier: 'free', // Default tier since not stored in DB
          member_role: organization.role,
        },
      });

      // Remove password_hash from response
      const { password_hash, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        token,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Login failed', { error });
      throw new AppError('Login failed', 500);
    }
  }

  /**
   * Get user by ID with organization info
   */
  async getUserById(userId: string): Promise<{ user: AuthUser; organization: AuthOrganization } | null> {
    try {
      const result = await this.pool.query(
        `SELECT
          u.id, u.email, u.first_name, u.last_name, u.is_active,
          c.id as org_id, c.name as org_name, cu.role as member_role
         FROM public.users u
         JOIN public.company_users cu ON u.id = cu.user_id
         JOIN public.companies c ON cu.company_id = c.id
         WHERE u.id = $1 AND u.is_active = true AND c.deleted_at IS NULL
         ORDER BY cu.created_at ASC
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        user: {
          id: row.id,
          email: row.email,
          first_name: row.first_name,
          last_name: row.last_name,
          is_active: row.is_active,
        },
        organization: {
          id: row.org_id,
          name: row.org_name,
          tier: 'free', // Default tier since not stored in DB
          member_role: row.member_role,
        },
      };
    } catch (error) {
      logger.error('Failed to get user by ID', { userId, error });
      return null;
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      // Get current password hash
      const result = await this.pool.query(
        'SELECT password_hash FROM public.users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new AppError('User not found', 404);
      }

      const { password_hash } = result.rows[0];

      // Verify current password
      if (!password_hash) {
        throw new AppError('Password not set for this account', 400);
      }

      const isPasswordValid = await this.comparePassword(currentPassword, password_hash);

      if (!isPasswordValid) {
        throw new AppError('Current password is incorrect', 401);
      }

      // Hash new password
      const newPasswordHash = await this.hashPassword(newPassword);

      // Update password
      await this.pool.query(
        'UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newPasswordHash, userId]
      );

      logger.info('Password updated successfully', { userId });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Failed to update password', { userId, error });
      throw new AppError('Failed to update password', 500);
    }
  }
}
