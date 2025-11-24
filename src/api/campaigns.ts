import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { activityLogger } from '../middleware/activityLogger';
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignFiltersSchema,
  addContactToCampaignSchema,
  updateCampaignContactSchema,
} from '../validation/crm-schemas';
import { logger } from '../utils/logger';




export const campaignsRouter = Router();
// 

// Enable authentication for all routes
campaignsRouter.use(authenticate);

/**
 * List campaigns
 */
campaignsRouter.get(
  '/',
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const filters = campaignFiltersSchema.parse({
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      campaign_type: req.query.campaign_type,
      status: req.query.status,
      owner_id: req.query.owner_id,
      search: req.query.search,
      tags: req.query.tags ? JSON.parse(req.query.tags as string) : undefined,
    });

    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;

    const conditions: string[] = ['c.company_id = $1', 'c.deleted_at IS NULL'];
    const params: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (filters.campaign_type) {
      paramCount++;
      conditions.push(`c.campaign_type = $${paramCount}`);
      params.push(filters.campaign_type);
    }

    if (filters.status) {
      paramCount++;
      conditions.push(`c.status = $${paramCount}`);
      params.push(filters.status);
    }

    if (filters.owner_id) {
      paramCount++;
      conditions.push(`c.owner_id = $${paramCount}`);
      params.push(filters.owner_id);
    }

    if (filters.search) {
      paramCount++;
      conditions.push(`(c.name ILIKE $${paramCount} OR c.description ILIKE $${paramCount})`);
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

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM public.crm_campaigns c WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT
        c.*,
        u.email as owner_email,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name,
        (SELECT COUNT(*) FROM public.crm_campaign_contacts cc WHERE cc.campaign_id = c.id) as contact_count
      FROM public.crm_campaigns c
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
 * Get campaign by ID
 */
campaignsRouter.get(
  '/:id',
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        c.*,
        u.email as owner_email,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name,
        (SELECT COUNT(*) FROM public.crm_campaign_contacts cc WHERE cc.campaign_id = c.id) as contact_count
      FROM public.crm_campaigns c
      LEFT JOIN public.users u ON c.owner_id = u.id

      WHERE c.id = $1 AND c.crm_company_id = $2 AND c.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Campaign not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Create campaign
 */
campaignsRouter.post(
  '/',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = createCampaignSchema.parse(req.body);
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO public.crm_campaigns (
        organization_id, name, description, campaign_type, status,
        start_date, end_date, budget, actual_cost, owner_id,
        target_audience, goals, tags, custom_fields, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING *`,
      [
        req.user!.organization!.id,
        data.name,
        data.description || null,
        data.campaign_type,
        data.status,
        data.start_date || null,
        data.end_date || null,
        data.budget || null,
        data.actual_cost || null,
        data.owner_id || req.user!.id,
        data.target_audience ? JSON.stringify(data.target_audience) : null,
        data.goals ? JSON.stringify(data.goals) : null,
        JSON.stringify(data.tags),
        JSON.stringify(data.custom_fields),
      ]
    );

    logger.info('Campaign created', {
      campaignId: result.rows[0].id,
      userId: req.user!.id,
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Update campaign
 */
campaignsRouter.put(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = updateCampaignSchema.parse(req.body);
    const pool = getPool();

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        paramCount++;
        if (['target_audience', 'goals', 'metrics', 'tags', 'custom_fields'].includes(key)) {
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
      `UPDATE public.crm_campaigns SET ${updates.join(', ')}
       WHERE id = $${paramCount + 1} AND company_id = $${paramCount + 2} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Campaign not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Delete campaign
 */
campaignsRouter.delete(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE public.crm_campaigns SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Campaign not found', 404);
    }

    res.json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  })
);

/**
 * Add contact to campaign
 */
campaignsRouter.post(
  '/:id/contacts',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = addContactToCampaignSchema.parse(req.body);
    const pool = getPool();

    // Verify campaign exists and belongs to organization
    const campaignCheck = await pool.query(
      'SELECT id FROM public.crm_campaigns WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.user!.organization!.id]
    );

    if (campaignCheck.rows.length === 0) {
      throw new AppError('Campaign not found', 404);
    }

    // Verify contact exists and belongs to organization
    const contactCheck = await pool.query(
      'SELECT id FROM public.crm_contacts WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
      [data.contact_id, req.user!.organization!.id]
    );

    if (contactCheck.rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }

    // Check if already added
    const existingCheck = await pool.query(
      'SELECT id FROM public.crm_campaign_contacts WHERE campaign_id = $1 AND contact_id = $2',
      [req.params.id, data.contact_id]
    );

    if (existingCheck.rows.length > 0) {
      throw new AppError('Contact already added to campaign', 409);
    }

    const result = await pool.query(
      `INSERT INTO public.crm_campaign_contacts (campaign_id, contact_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING *`,
      [req.params.id, data.contact_id, data.status || 'pending']
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * List campaign contacts
 */
campaignsRouter.get(
  '/:id/contacts',
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        cc.*,
        c.first_name,
        c.last_name,
        c.email,
        c.title,
        comp.name as company_name
      FROM public.crm_campaign_contacts cc
      INNER JOIN public.crm_contacts c ON cc.contact_id = c.id
      LEFT JOIN public.crm_companies comp ON c.crm_company_id = comp.id
      INNER JOIN public.crm_campaigns camp ON cc.campaign_id = camp.id
      WHERE cc.campaign_id = $1 AND camp.crm_company_id = $2
      ORDER BY cc.created_at DESC`,
      [req.params.id, req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  })
);

/**
 * Get campaign metrics
 */
campaignsRouter.get(
  '/:id/metrics',
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_contacts,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
        COUNT(CASE WHEN status = 'opened' THEN 1 END) as opened_count,
        COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked_count,
        COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced_count,
        COUNT(CASE WHEN status = 'unsubscribed' THEN 1 END) as unsubscribed_count
      FROM public.crm_campaign_contacts cc
      INNER JOIN public.crm_campaigns c ON cc.campaign_id = c.id
      WHERE cc.campaign_id = $1 AND c.crm_company_id = $2`,
      [req.params.id, req.user!.organization!.id]
    );

    const metrics = result.rows[0];
    const totalContacts = parseInt(metrics.total_contacts);
    const sentCount = parseInt(metrics.sent_count);
    const openedCount = parseInt(metrics.opened_count);
    const clickedCount = parseInt(metrics.clicked_count);

    res.json({
      success: true,
      data: {
        ...metrics,
        open_rate: sentCount > 0 ? (openedCount / sentCount * 100).toFixed(2) : 0,
        click_through_rate: openedCount > 0 ? (clickedCount / openedCount * 100).toFixed(2) : 0,
        delivery_rate: totalContacts > 0 ? (parseInt(metrics.delivered_count) / totalContacts * 100).toFixed(2) : 0,
      },
    });
  })
);

/**
 * Update campaign contact status
 */
campaignsRouter.put(
  '/:id/contacts/:contactId',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('campaign'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = updateCampaignContactSchema.parse(req.body);
    const pool = getPool();

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (data.status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(data.status);
    }

    if (data.sent_at !== undefined) {
      paramCount++;
      updates.push(`sent_at = $${paramCount}`);
      values.push(data.sent_at);
    }

    if (data.opened_at !== undefined) {
      paramCount++;
      updates.push(`opened_at = $${paramCount}`);
      values.push(data.opened_at);
    }

    if (data.clicked_at !== undefined) {
      paramCount++;
      updates.push(`clicked_at = $${paramCount}`);
      values.push(data.clicked_at);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id, req.params.contactId);

    const result = await pool.query(
      `UPDATE public.crm_campaign_contacts SET ${updates.join(', ')}
       WHERE campaign_id = $${paramCount + 1} AND contact_id = $${paramCount + 2}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Campaign contact not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);
