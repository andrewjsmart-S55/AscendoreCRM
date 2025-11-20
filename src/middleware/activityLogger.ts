import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getPool } from '../database/connection';
import { logger } from '../utils/logger';

export interface ActivityContext {
  entityType: string;
  entityId?: string;
  activityType: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Log CRM activity to database
 */
export async function logActivity(
  organizationId: string,
  userId: string,
  context: ActivityContext
) {
  try {
    const pool = getPool();

    await pool.query(
      `SELECT log_crm_activity($1, $2, $3, $4, $5, $6, $7)`,
      [
        organizationId,
        context.activityType,
        context.entityType,
        context.entityId || null,
        context.description || null,
        userId,
        JSON.stringify(context.metadata || {}),
      ]
    );
  } catch (error) {
    logger.error('Failed to log activity', {
      error,
      context,
      organizationId,
      userId,
    });
  }
}

/**
 * Middleware to automatically log activities
 */
export const activityLogger = (entityType: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (data: any) {
      // Log activity after successful response
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const activityType = getActivityType(req.method);
        const entityId = req.params.id || data?.data?.id;

        setImmediate(() => {
          logActivity(
            req.user!.organization!.id,
            req.user!.id,
            {
              entityType,
              entityId,
              activityType,
              description: `${activityType} ${entityType}`,
              metadata: {
                method: req.method,
                path: req.path,
                ip: req.ip,
                userAgent: req.get('user-agent'),
              },
            }
          ).catch((error) => {
            logger.error('Activity logging failed', { error });
          });
        });
      }

      return originalJson(data);
    };

    next();
  };
};

function getActivityType(method: string): string {
  const map: Record<string, string> = {
    POST: 'created',
    PUT: 'updated',
    PATCH: 'updated',
    DELETE: 'deleted',
    GET: 'viewed',
  };
  return map[method] || 'action';
}
