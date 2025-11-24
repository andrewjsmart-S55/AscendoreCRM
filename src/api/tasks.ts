import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { activityLogger } from '../middleware/activityLogger';
import {
  createTaskSchema,
  updateTaskSchema,
  taskFiltersSchema,
} from '../validation/crm-schemas';
import { logger } from '../utils/logger';




export const tasksRouter = Router();
// 

// Enable authentication for all routes
tasksRouter.use(authenticate);

/**
 * List tasks
 */
tasksRouter.get(
  '/',
  activityLogger('task'),
  asyncHandler(async (req: AuthRequest, res) => {
    const filters = taskFiltersSchema.parse({
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      related_to_type: req.query.related_to_type,
      related_to_id: req.query.related_to_id,
      task_type: req.query.task_type,
      status: req.query.status,
      priority: req.query.priority,
      assigned_to_id: req.query.assigned_to_id,
      created_by_id: req.query.created_by_id,
      overdue: req.query.overdue === 'true',
      search: req.query.search,
      tags: req.query.tags ? JSON.parse(req.query.tags as string) : undefined,
    });

    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;

    const conditions: string[] = ['t.company_id = $1', 't.deleted_at IS NULL'];
    const params: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (filters.related_to_type) {
      paramCount++;
      conditions.push(`t.related_to_type = $${paramCount}`);
      params.push(filters.related_to_type);
    }

    if (filters.related_to_id) {
      paramCount++;
      conditions.push(`t.related_to_id = $${paramCount}`);
      params.push(filters.related_to_id);
    }

    if (filters.task_type) {
      paramCount++;
      conditions.push(`t.task_type = $${paramCount}`);
      params.push(filters.task_type);
    }

    if (filters.status) {
      paramCount++;
      conditions.push(`t.status = $${paramCount}`);
      params.push(filters.status);
    }

    if (filters.priority) {
      paramCount++;
      conditions.push(`t.priority = $${paramCount}`);
      params.push(filters.priority);
    }

    if (filters.assigned_to_id) {
      paramCount++;
      conditions.push(`t.assigned_to_id = $${paramCount}`);
      params.push(filters.assigned_to_id);
    }

    if (filters.created_by_id) {
      paramCount++;
      conditions.push(`t.created_by_id = $${paramCount}`);
      params.push(filters.created_by_id);
    }

    if (filters.overdue) {
      conditions.push(`t.due_date < NOW() AND t.status != 'completed'`);
    }

    if (filters.search) {
      paramCount++;
      conditions.push(`(t.title ILIKE $${paramCount} OR t.description ILIKE $${paramCount})`);
      params.push(`%${filters.search}%`);
    }

    if (filters.tags && filters.tags.length > 0) {
      paramCount++;
      conditions.push(`t.tags @> $${paramCount}::jsonb`);
      params.push(JSON.stringify(filters.tags));
    }

    const whereClause = conditions.join(' AND ');
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM public.crm_tasks t WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT
        t.*,
        assigned.email as assigned_to_email,
        assigned_CONCAT(u.first_name, ' ', u.last_name) as assigned_to_name,
        creator.email as created_by_email,
        creator_CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM public.crm_tasks t
      LEFT JOIN public.users assigned ON t.assigned_to_id = assigned.id
      LEFT JOIN public.profiles assigned_p ON t.assigned_to_id = assigned_p.id
      LEFT JOIN public.users creator ON t.created_by_id = creator.id
      LEFT JOIN public.profiles creator_p ON t.created_by_id = creator_p.id
      WHERE ${whereClause}
      ORDER BY t.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, filters.limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        total_pages: Math.ceil(total / filters.limit),
      },
    });
  })
);

/**
 * Get my tasks
 */
tasksRouter.get(
  '/my-tasks',
  activityLogger('task'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT t.*
      FROM public.crm_tasks t
      WHERE t.assigned_to_id = $1 AND t.company_id = $2 AND t.deleted_at IS NULL AND t.status != 'completed'
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.due_date ASC NULLS LAST`,
      [req.user!.id, req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);

/**
 * Get task by ID
 */
tasksRouter.get(
  '/:id',
  activityLogger('task'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        t.*,
        assigned.email as assigned_to_email,
        assigned_CONCAT(u.first_name, ' ', u.last_name) as assigned_to_name,
        creator.email as created_by_email,
        creator_CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM public.crm_tasks t
      LEFT JOIN public.users assigned ON t.assigned_to_id = assigned.id
      LEFT JOIN public.profiles assigned_p ON t.assigned_to_id = assigned_p.id
      LEFT JOIN public.users creator ON t.created_by_id = creator.id
      LEFT JOIN public.profiles creator_p ON t.created_by_id = creator_p.id
      WHERE t.id = $1 AND t.company_id = $2 AND t.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Task not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Create task
 */
tasksRouter.post(
  '/',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('task'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = createTaskSchema.parse(req.body);
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO public.crm_tasks (
        organization_id, title, description, related_to_type, related_to_id,
        task_type, status, priority, due_date, assigned_to_id, created_by_id,
        tags, custom_fields, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *`,
      [
        req.user!.organization!.id,
        data.title,
        data.description || null,
        data.related_to_type || null,
        data.related_to_id || null,
        data.task_type,
        data.status,
        data.priority,
        data.due_date || null,
        data.assigned_to_id || req.user!.id,
        req.user!.id,
        JSON.stringify(data.tags),
        JSON.stringify(data.custom_fields),
      ]
    );

    logger.info('Task created', {
      taskId: result.rows[0].id,
      userId: req.user!.id,
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Update task
 */
tasksRouter.put(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('task'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = updateTaskSchema.parse(req.body);
    const pool = getPool();

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        paramCount++;
        if (['tags', 'custom_fields'].includes(key)) {
          updates.push(`${key} = $${paramCount}`);
          values.push(JSON.stringify(value));
        } else {
          updates.push(`${key} = $${paramCount}`);
          values.push(value);
        }
      }
    });

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id, req.user!.organization!.id);

    const result = await pool.query(
      `UPDATE public.crm_tasks SET ${updates.join(', ')}
       WHERE id = $${paramCount + 1} AND organization_id = $${paramCount + 2} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Task not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Complete task
 */
tasksRouter.put(
  '/:id/complete',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('task'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE public.crm_tasks
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Task not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Delete task
 */
tasksRouter.delete(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('task'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE public.crm_tasks SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Task not found', 404);
    }

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  })
);
