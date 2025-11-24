import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { activityLogger } from '../middleware/activityLogger';
import {
  createCompanySchema,
  updateCompanySchema,
  companyFiltersSchema,
} from '../validation/crm-schemas';
import { logger } from '../utils/logger';




export const companiesRouter = Router();

// Apply authentication to all routes

// Enable authentication for all routes
companiesRouter.use(authenticate);

/**
 * List companies with filters and pagination
 */
companiesRouter.get(
  '/',
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const filters = companyFiltersSchema.parse({
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      company_status: req.query.company_status,
      industry: req.query.industry,
      company_size: req.query.company_size,
      owner_id: req.query.owner_id,
      search: req.query.search,
      tags: req.query.tags ? JSON.parse(req.query.tags as string) : undefined,
    });

    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;

    // Build WHERE clause
    const conditions: string[] = ['c.company_id = $1', 'c.deleted_at IS NULL'];
    const params: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (filters.company_status) {
      paramCount++;
      conditions.push(`c.company_status = $${paramCount}`);
      params.push(filters.company_status);
    }

    if (filters.industry) {
      paramCount++;
      conditions.push(`c.industry = $${paramCount}`);
      params.push(filters.industry);
    }

    if (filters.company_size) {
      paramCount++;
      conditions.push(`c.company_size = $${paramCount}`);
      params.push(filters.company_size);
    }

    if (filters.owner_id) {
      paramCount++;
      conditions.push(`c.owner_id = $${paramCount}`);
      params.push(filters.owner_id);
    }

    if (filters.search) {
      paramCount++;
      conditions.push(`(c.name ILIKE $${paramCount} OR c.website ILIKE $${paramCount})`);
      params.push(`%${filters.search}%`);
    }

    if (filters.tags && filters.tags.length > 0) {
      paramCount++;
      conditions.push(`c.tags @> $${paramCount}::jsonb`);
      params.push(JSON.stringify(filters.tags));
    }

    const whereClause = conditions.join(' AND ');
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM public.crm_companies c WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const result = await pool.query(
      `SELECT
        c.*,
        u.email as owner_email,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name
      FROM public.crm_companies c
      LEFT JOIN public.users u ON c.owner_id = u.id

      WHERE ${whereClause}
      ORDER BY c.${sortBy} ${sortOrder}
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
 * Get company by ID
 */
companiesRouter.get(
  '/:id',
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        c.*,
        u.email as owner_email,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name
      FROM public.crm_companies c
      LEFT JOIN public.users u ON c.owner_id = u.id

      WHERE c.id = $1 AND c.company_id = $2 AND c.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Company not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Create company
 */
companiesRouter.post(
  '/',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = createCompanySchema.parse(req.body);
    const pool = getPool();

    // Check if slug is unique within organization
    if (data.slug) {
      const slugCheck = await pool.query(
        'SELECT id FROM public.crm_companies WHERE slug = $1 AND company_id = $2 AND deleted_at IS NULL',
        [data.slug, req.user!.organization!.id]
      );

      if (slugCheck.rows.length > 0) {
        throw new AppError('Company slug already exists', 409);
      }
    }

    const result = await pool.query(
      `INSERT INTO public.crm_companies (
        company_id, name, slug, industry, company_size, website,
        billing_address, shipping_address, annual_revenue, employee_count,
        company_status, owner_id, tags, custom_fields, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING *`,
      [
        req.user!.organization!.id,
        data.name,
        data.slug || null,
        data.industry || null,
        data.company_size || null,
        data.website || null,
        data.billing_address ? JSON.stringify(data.billing_address) : null,
        data.shipping_address ? JSON.stringify(data.shipping_address) : null,
        data.annual_revenue || null,
        data.employee_count || null,
        data.company_status,
        data.owner_id || req.user!.id,
        JSON.stringify(data.tags),
        JSON.stringify(data.custom_fields),
      ]
    );

    logger.info('Company created', {
      companyId: result.rows[0].id,
      userId: req.user!.id,
      organizationId: req.user!.organization!.id,
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Update company
 */
companiesRouter.put(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = updateCompanySchema.parse(req.body);
    const pool = getPool();

    // Check if slug is unique
    if (data.slug) {
      const slugCheck = await pool.query(
        'SELECT id FROM public.crm_companies WHERE slug = $1 AND company_id = $2 AND id != $3 AND deleted_at IS NULL',
        [data.slug, req.user!.organization!.id, req.params.id]
      );

      if (slugCheck.rows.length > 0) {
        throw new AppError('Company slug already exists', 409);
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (data.name !== undefined) {
      updates.push(`name = $${++paramCount}`);
      values.push(data.name);
    }
    if (data.slug !== undefined) {
      updates.push(`slug = $${++paramCount}`);
      values.push(data.slug);
    }
    if (data.industry !== undefined) {
      updates.push(`industry = $${++paramCount}`);
      values.push(data.industry);
    }
    if (data.company_size !== undefined) {
      updates.push(`company_size = $${++paramCount}`);
      values.push(data.company_size);
    }
    if (data.website !== undefined) {
      updates.push(`website = $${++paramCount}`);
      values.push(data.website);
    }
    if (data.billing_address !== undefined) {
      updates.push(`billing_address = $${++paramCount}`);
      values.push(JSON.stringify(data.billing_address));
    }
    if (data.shipping_address !== undefined) {
      updates.push(`shipping_address = $${++paramCount}`);
      values.push(JSON.stringify(data.shipping_address));
    }
    if (data.annual_revenue !== undefined) {
      updates.push(`annual_revenue = $${++paramCount}`);
      values.push(data.annual_revenue);
    }
    if (data.employee_count !== undefined) {
      updates.push(`employee_count = $${++paramCount}`);
      values.push(data.employee_count);
    }
    if (data.company_status !== undefined) {
      updates.push(`company_status = $${++paramCount}`);
      values.push(data.company_status);
    }
    if (data.owner_id !== undefined) {
      updates.push(`owner_id = $${++paramCount}`);
      values.push(data.owner_id);
    }
    if (data.tags !== undefined) {
      updates.push(`tags = $${++paramCount}`);
      values.push(JSON.stringify(data.tags));
    }
    if (data.custom_fields !== undefined) {
      updates.push(`custom_fields = $${++paramCount}`);
      values.push(JSON.stringify(data.custom_fields));
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    values.push(req.user!.organization!.id);

    const result = await pool.query(
      `UPDATE public.crm_companies
       SET ${updates.join(', ')}
       WHERE id = $${paramCount + 1} AND company_id = $${paramCount + 2} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Company not found', 404);
    }

    logger.info('Company updated', {
      companyId: req.params.id,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Delete company (soft delete)
 */
companiesRouter.delete(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE public.crm_companies
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Company not found', 404);
    }

    logger.info('Company deleted', {
      companyId: req.params.id,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      message: 'Company deleted successfully',
    });
  })
);

/**
 * Get company contacts
 */
companiesRouter.get(
  '/:id/contacts',
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT c.*
      FROM public.crm_contacts c
      WHERE c.company_id = $1 AND c.company_id = $2 AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC`,
      [req.params.id, req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);

/**
 * Get company deals
 */
companiesRouter.get(
  '/:id/deals',
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT d.*
      FROM public.crm_deals d
      WHERE d.company_id = $1 AND d.company_id = $2 AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC`,
      [req.params.id, req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);

/**
 * Get company activities
 */
companiesRouter.get(
  '/:id/activities',
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        a.*,
        u.email as user_email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name
      FROM public.crm_activities a
      LEFT JOIN public.users u ON a.user_id = u.id

      WHERE a.entity_type = 'company' AND a.entity_id = $1 AND a.company_id = $2
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

/**
 * Get company notes
 */
companiesRouter.get(
  '/:id/notes',
  activityLogger('company'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        n.*,
        u.email as created_by_email,
        CONCAT(u.first_name, ' ', u.last_name) as created_by_name
      FROM public.crm_notes n
      LEFT JOIN public.users u ON n.created_by_id = u.id

      WHERE n.related_to_type = 'company' AND n.related_to_id = $1 AND n.company_id = $2 AND n.deleted_at IS NULL
      ORDER BY n.is_pinned DESC, n.created_at DESC`,
      [req.params.id, req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);
