import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { activityLogger } from '../middleware/activityLogger';
import {
  createProjectSchema,
  updateProjectSchema,
  projectFiltersSchema,
} from '../validation/crm-schemas';
import { logger } from '../utils/logger';




export const projectsRouter = Router();
// 

// Enable authentication for all routes
projectsRouter.use(authenticate);

/**
 * List projects
 */
projectsRouter.get(
  '/',
  activityLogger('project'),
  asyncHandler(async (req: AuthRequest, res) => {
    const filters = projectFiltersSchema.parse({
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      crm_company_id: req.query.crm_company_id,
      deal_id: req.query.deal_id,
      project_status: req.query.project_status,
      priority: req.query.priority,
      owner_id: req.query.owner_id,
      project_manager_id: req.query.project_manager_id,
      search: req.query.search,
      tags: req.query.tags ? JSON.parse(req.query.tags as string) : undefined,
    });

    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;

    const conditions: string[] = ['pr.company_id = $1', 'pr.deleted_at IS NULL'];
    const params: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (filters.company_id) {
      paramCount++;
      conditions.push(`pr.company_id = $${paramCount}`);
      params.push(filters.company_id);
    }

    if (filters.deal_id) {
      paramCount++;
      conditions.push(`pr.deal_id = $${paramCount}`);
      params.push(filters.deal_id);
    }

    if (filters.project_status) {
      paramCount++;
      conditions.push(`pr.project_status = $${paramCount}`);
      params.push(filters.project_status);
    }

    if (filters.priority) {
      paramCount++;
      conditions.push(`pr.priority = $${paramCount}`);
      params.push(filters.priority);
    }

    if (filters.owner_id) {
      paramCount++;
      conditions.push(`pr.owner_id = $${paramCount}`);
      params.push(filters.owner_id);
    }

    if (filters.project_manager_id) {
      paramCount++;
      conditions.push(`pr.project_manager_id = $${paramCount}`);
      params.push(filters.project_manager_id);
    }

    if (filters.search) {
      paramCount++;
      conditions.push(`(pr.name ILIKE $${paramCount} OR pr.description ILIKE $${paramCount})`);
      params.push(`%${filters.search}%`);
    }

    if (filters.tags && filters.tags.length > 0) {
      paramCount++;
      conditions.push(`pr.tags @> $${paramCount}::jsonb`);
      params.push(JSON.stringify(filters.tags));
    }

    const whereClause = conditions.join(' AND ');
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM public.crm_projects pr WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT
        pr.*,
        comp.name as company_name,
        d.name as deal_name,
        owner.email as owner_email,
        owner_CONCAT(u.first_name, ' ', u.last_name) as owner_name,
        pm.email as project_manager_email,
        pm_CONCAT(u.first_name, ' ', u.last_name) as project_manager_name,
        (SELECT COUNT(*) FROM public.crm_tasks t WHERE t.related_to_type = 'project' AND t.related_to_id = pr.id AND t.deleted_at IS NULL) as task_count
      FROM public.crm_projects pr
      LEFT JOIN public.crm_companies comp ON pr.company_id = comp.id
      LEFT JOIN public.crm_deals d ON pr.deal_id = d.id
      LEFT JOIN public.users owner ON pr.owner_id = owner.id
      LEFT JOIN public.profiles owner_p ON pr.owner_id = owner_p.id
      LEFT JOIN public.users pm ON pr.project_manager_id = pm.id
      LEFT JOIN public.profiles pm_p ON pr.project_manager_id = pm_p.id
      WHERE ${whereClause}
      ORDER BY pr.${sortBy} ${sortOrder}
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
 * Get project by ID
 */
projectsRouter.get(
  '/:id',
  activityLogger('project'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        pr.*,
        comp.name as company_name,
        d.name as deal_name,
        owner.email as owner_email,
        owner_CONCAT(u.first_name, ' ', u.last_name) as owner_name,
        pm.email as project_manager_email,
        pm_CONCAT(u.first_name, ' ', u.last_name) as project_manager_name
      FROM public.crm_projects pr
      LEFT JOIN public.crm_companies comp ON pr.company_id = comp.id
      LEFT JOIN public.crm_deals d ON pr.deal_id = d.id
      LEFT JOIN public.users owner ON pr.owner_id = owner.id
      LEFT JOIN public.profiles owner_p ON pr.owner_id = owner_p.id
      LEFT JOIN public.users pm ON pr.project_manager_id = pm.id
      LEFT JOIN public.profiles pm_p ON pr.project_manager_id = pm_p.id
      WHERE pr.id = $1 AND pr.company_id = $2 AND pr.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Create project
 */
projectsRouter.post(
  '/',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('project'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = createProjectSchema.parse(req.body);
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO public.crm_projects (
        organization_id, company_id, deal_id, name, description,
        project_status, priority, start_date, due_date, estimated_hours,
        owner_id, project_manager_id, tags, custom_fields, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING *`,
      [
        req.user!.organization!.id,
        data.company_id || null,
        data.deal_id || null,
        data.name,
        data.description || null,
        data.project_status,
        data.priority,
        data.start_date || null,
        data.due_date || null,
        data.estimated_hours || null,
        data.owner_id || req.user!.id,
        data.project_manager_id || null,
        JSON.stringify(data.tags),
        JSON.stringify(data.custom_fields),
      ]
    );

    logger.info('Project created', {
      projectId: result.rows[0].id,
      userId: req.user!.id,
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Update project
 */
projectsRouter.put(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('project'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = updateProjectSchema.parse(req.body);
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
      `UPDATE public.crm_projects SET ${updates.join(', ')}
       WHERE id = $${paramCount + 1} AND organization_id = $${paramCount + 2} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Delete project
 */
projectsRouter.delete(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  activityLogger('project'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE public.crm_projects SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  })
);

/**
 * Get project tasks
 */
projectsRouter.get(
  '/:id/tasks',
  activityLogger('project'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT t.*
      FROM public.crm_tasks t
      INNER JOIN public.crm_projects pr ON t.related_to_id = pr.id
      WHERE t.related_to_type = 'project'
        AND t.related_to_id = $1
        AND pr.company_id = $2
        AND t.deleted_at IS NULL
      ORDER BY
        CASE t.status
          WHEN 'in_progress' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'completed' THEN 3
          WHEN 'cancelled' THEN 4
        END,
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.due_date ASC NULLS LAST`,
      [req.params.id, req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);

/**
 * Get project activities
 */
projectsRouter.get(
  '/:id/activities',
  activityLogger('project'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        a.*,
        u.email as user_email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name
      FROM public.crm_activities a
      LEFT JOIN public.users u ON a.user_id = u.id

      WHERE a.entity_type = 'project' AND a.entity_id = $1 AND a.company_id = $2
      ORDER BY a.created_at DESC
      LIMIT 100`,
      [req.params.id, req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);
