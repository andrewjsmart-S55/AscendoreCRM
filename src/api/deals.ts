import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { activityLogger } from '../middleware/activityLogger';
import {
  createDealSchema,
  updateDealSchema,
  dealFiltersSchema,
} from '../validation/crm-schemas';
import { logger } from '../utils/logger';




export const dealsRouter = Router();
// 

// Enable authentication for all routes
dealsRouter.use(authenticate);

/**
 * List deals
 */
dealsRouter.get(
  '/',
  activityLogger('deal'),
  asyncHandler(async (req: AuthRequest, res) => {
    const filters = dealFiltersSchema.parse({
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      crm_company_id: req.query.crm_company_id,
      stage: req.query.stage,
      owner_id: req.query.owner_id,
      min_amount: req.query.min_amount ? Number(req.query.min_amount) : undefined,
      max_amount: req.query.max_amount ? Number(req.query.max_amount) : undefined,
      currency: req.query.currency,
      search: req.query.search,
      tags: req.query.tags ? JSON.parse(req.query.tags as string) : undefined,
    });

    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;

    const conditions: string[] = ['d.company_id = $1', 'd.deleted_at IS NULL'];
    const params: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (filters.company_id) {
      paramCount++;
      conditions.push(`d.company_id = $${paramCount}`);
      params.push(filters.company_id);
    }

    if (filters.stage) {
      paramCount++;
      conditions.push(`d.stage = $${paramCount}`);
      params.push(filters.stage);
    }

    if (filters.owner_id) {
      paramCount++;
      conditions.push(`d.owner_id = $${paramCount}`);
      params.push(filters.owner_id);
    }

    if (filters.min_amount !== undefined) {
      paramCount++;
      conditions.push(`d.amount >= $${paramCount}`);
      params.push(filters.min_amount);
    }

    if (filters.max_amount !== undefined) {
      paramCount++;
      conditions.push(`d.amount <= $${paramCount}`);
      params.push(filters.max_amount);
    }

    if (filters.currency) {
      paramCount++;
      conditions.push(`d.currency = $${paramCount}`);
      params.push(filters.currency);
    }

    if (filters.search) {
      paramCount++;
      conditions.push(`d.name ILIKE $${paramCount}`);
      params.push(`%${filters.search}%`);
    }

    if (filters.tags && filters.tags.length > 0) {
      paramCount++;
      conditions.push(`d.tags @> $${paramCount}::jsonb`);
      params.push(JSON.stringify(filters.tags));
    }

    const whereClause = conditions.join(' AND ');
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM public.crm_deals d WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT
        d.*,
        comp.name as company_name,
        c.first_name || ' ' || c.last_name as contact_name,
        u.email as owner_email,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name
      FROM public.crm_deals d
      LEFT JOIN public.crm_companies comp ON d.company_id = comp.id
      LEFT JOIN public.crm_contacts c ON d.primary_contact_id = c.id
      LEFT JOIN public.users u ON d.owner_id = u.id

      WHERE ${whereClause}
      ORDER BY d.${sortBy} ${sortOrder}
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
 * Get deal pipeline analytics
 */
dealsRouter.get(
  '/pipeline',
  activityLogger('deal'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        stage,
        COUNT(*) as deal_count,
        SUM(amount) as total_value,
        AVG(probability) as avg_probability
      FROM public.crm_deals
      WHERE organization_id = $1 AND deleted_at IS NULL
      GROUP BY stage
      ORDER BY
        CASE stage
          WHEN 'prospecting' THEN 1
          WHEN 'qualification' THEN 2
          WHEN 'proposal' THEN 3
          WHEN 'negotiation' THEN 4
          WHEN 'closed_won' THEN 5
          WHEN 'closed_lost' THEN 6
        END`,
      [req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);

/**
 * Get deal by ID
 */
dealsRouter.get(
  '/:id',
  activityLogger('deal'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        d.*,
        comp.name as company_name,
        c.first_name || ' ' || c.last_name as contact_name,
        u.email as owner_email,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name
      FROM public.crm_deals d
      LEFT JOIN public.crm_companies comp ON d.company_id = comp.id
      LEFT JOIN public.crm_contacts c ON d.primary_contact_id = c.id
      LEFT JOIN public.users u ON d.owner_id = u.id

      WHERE d.id = $1 AND d.company_id = $2 AND d.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Deal not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Create deal
 */
dealsRouter.post(
  '/',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('deal'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = createDealSchema.parse(req.body);
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO public.crm_deals (
        organization_id, company_id, primary_contact_id, name, description,
        amount, currency, stage, probability, expected_close_date, deal_source,
        owner_id, tags, custom_fields, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING *`,
      [
        req.user!.organization!.id,
        data.company_id || null,
        data.primary_contact_id || null,
        data.name,
        data.description || null,
        data.amount || null,
        data.currency || 'USD',
        data.stage,
        data.probability,
        data.expected_close_date || null,
        data.deal_source || null,
        data.owner_id || req.user!.id,
        JSON.stringify(data.tags),
        JSON.stringify(data.custom_fields),
      ]
    );

    logger.info('Deal created', {
      dealId: result.rows[0].id,
      userId: req.user!.id,
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Update deal
 */
dealsRouter.put(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('deal'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = updateDealSchema.parse(req.body);
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
      `UPDATE public.crm_deals SET ${updates.join(', ')}
       WHERE id = $${paramCount + 1} AND organization_id = $${paramCount + 2} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Deal not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Update deal stage
 */
dealsRouter.put(
  '/:id/stage',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('deal'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { stage, lost_reason } = req.body;
    const pool = getPool();

    const updates = ['stage = $1', 'updated_at = NOW()'];
    const params: any[] = [stage, req.params.id, req.user!.organization!.id];

    if (stage === 'closed_won' || stage === 'closed_lost') {
      updates.push('actual_close_date = NOW()');
    }

    if (stage === 'closed_lost' && lost_reason) {
      updates.push('lost_reason = $4');
      params.push(lost_reason);
    }

    const result = await pool.query(
      `UPDATE public.crm_deals SET ${updates.join(', ')}
       WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new AppError('Deal not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Delete deal
 */
dealsRouter.delete(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  activityLogger('deal'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE public.crm_deals SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Deal not found', 404);
    }

    res.json({
      success: true,
      message: 'Deal deleted successfully',
    });
  })
);
