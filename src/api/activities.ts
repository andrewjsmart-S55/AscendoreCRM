import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';




export const activitiesRouter = Router();
// 

// Enable authentication for all routes
activitiesRouter.use(authenticate);

/**
 * List activities with filters
 */
activitiesRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['company_id = $1'];
    const params: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (req.query.entity_type) {
      paramCount++;
      conditions.push(`entity_type = $${paramCount}`);
      params.push(req.query.entity_type);
    }

    if (req.query.entity_id) {
      paramCount++;
      conditions.push(`entity_id = $${paramCount}`);
      params.push(req.query.entity_id);
    }

    if (req.query.activity_type) {
      paramCount++;
      conditions.push(`activity_type = $${paramCount}`);
      params.push(req.query.activity_type);
    }

    if (req.query.user_id) {
      paramCount++;
      conditions.push(`user_id = $${paramCount}`);
      params.push(req.query.user_id);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM public.crm_activities WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT
        a.*,
        u.email as user_email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name
      FROM public.crm_activities a
      LEFT JOIN public.users u ON a.user_id = u.id

      WHERE ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * Get activity feed for current user
 */
activitiesRouter.get(
  '/feed',
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const result = await pool.query(
      `SELECT
        a.*,
        u.email as user_email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name
      FROM public.crm_activities a
      LEFT JOIN public.users u ON a.user_id = u.id

      WHERE a.company_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2`,
      [req.user!.organization!.id, limit]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);
