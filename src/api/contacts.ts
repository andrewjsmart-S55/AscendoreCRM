import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { activityLogger } from '../middleware/activityLogger';
import {
  createContactSchema,
  updateContactSchema,
  contactFiltersSchema,
} from '../validation/crm-schemas';
import { logger } from '../utils/logger';


export const contactsRouter = Router();

// Enable authentication for all contact routes
contactsRouter.use(authenticate);
/**
 * List contacts
 */
contactsRouter.get(
  '/',
  activityLogger('contact'),
  asyncHandler(async (req: AuthRequest, res) => {
    const filters = contactFiltersSchema.parse({
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      crm_company_id: req.query.crm_company_id,
      contact_status: req.query.contact_status,
      lead_source: req.query.lead_source,
      owner_id: req.query.owner_id,
      min_lead_score: req.query.min_lead_score ? Number(req.query.min_lead_score) : undefined,
      max_lead_score: req.query.max_lead_score ? Number(req.query.max_lead_score) : undefined,
      search: req.query.search,
      tags: req.query.tags ? JSON.parse(req.query.tags as string) : undefined,
    });

    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;

    const conditions: string[] = ['c.company_id = $1', 'c.deleted_at IS NULL'];
    const params: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (filters.company_id) {
      paramCount++;
      conditions.push(`c.crm_company_id = $${paramCount}`);
      params.push(filters.company_id);
    }

    if (filters.contact_status) {
      paramCount++;
      conditions.push(`c.contact_status = $${paramCount}`);
      params.push(filters.contact_status);
    }

    if (filters.lead_source) {
      paramCount++;
      conditions.push(`c.lead_source = $${paramCount}`);
      params.push(filters.lead_source);
    }

    if (filters.owner_id) {
      paramCount++;
      conditions.push(`c.owner_id = $${paramCount}`);
      params.push(filters.owner_id);
    }

    if (filters.min_lead_score !== undefined) {
      paramCount++;
      conditions.push(`c.lead_score >= $${paramCount}`);
      params.push(filters.min_lead_score);
    }

    if (filters.max_lead_score !== undefined) {
      paramCount++;
      conditions.push(`c.lead_score <= $${paramCount}`);
      params.push(filters.max_lead_score);
    }

    if (filters.search) {
      paramCount++;
      conditions.push(`(c.first_name ILIKE $${paramCount} OR c.last_name ILIKE $${paramCount} OR c.email ILIKE $${paramCount})`);
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
      `SELECT COUNT(*) as total FROM public.crm_contacts c WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT
        c.*,
        comp.name as company_name,
        u.email as owner_email,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name
      FROM public.crm_contacts c
      LEFT JOIN public.crm_companies comp ON c.crm_company_id = comp.id
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
 * Get contact by ID
 */
contactsRouter.get(
  '/:id',
  activityLogger('contact'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        c.*,
        comp.name as company_name,
        u.email as owner_email,
        CONCAT(u.first_name, ' ', u.last_name) as owner_name
      FROM public.crm_contacts c
      LEFT JOIN public.crm_companies comp ON c.crm_company_id = comp.id
      LEFT JOIN public.users u ON c.owner_id = u.id

      WHERE c.id = $1 AND c.crm_company_id = $2 AND c.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Create contact
 */
contactsRouter.post(
  '/',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('contact'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = createContactSchema.parse(req.body);
    const pool = getPool();

    // Check email uniqueness
    if (data.email) {
      const emailCheck = await pool.query(
        'SELECT id FROM public.crm_contacts WHERE email = $1 AND company_id = $2 AND deleted_at IS NULL',
        [data.email, req.user!.organization!.id]
      );

      if (emailCheck.rows.length > 0) {
        throw new AppError('Contact with this email already exists', 409);
      }
    }

    // Get AI lead score if not provided
    let leadScore = data.lead_score || 0;
    try {
      if (!data.lead_score) {
        logger.info('Requesting AI lead score for contact', {
          name: `${data.first_name} ${data.last_name}`,
        });

        const scoreResponse = await fetch('http://localhost:5001/api/v1/agents/lead-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: data.first_name,
            last_name: data.last_name,
            title: data.title,
            email: data.email,
            phone: data.phone,
            lead_source: data.lead_source,
            tags: data.tags,
            company: {}, // Empty company object for now
          }),
        });

        if (scoreResponse.ok) {
          const scoreData = await scoreResponse.json();
          leadScore = scoreData.score;
          logger.info('AI lead score received', {
            score: leadScore,
            reasoning: scoreData.reasoning,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to get AI lead score, using default', { error });
      // Continue with default score if AI service fails
    }

    const result = await pool.query(
      `INSERT INTO public.crm_contacts (
        company_id, crm_company_id, first_name, last_name, email, phone, mobile,
        title, department, contact_status, lead_source, lead_score, owner_id,
        social_profiles, preferences, tags, custom_fields, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
      RETURNING *`,
      [
        req.user!.organization!.id,
        data.crm_company_id || null,
        data.first_name,
        data.last_name,
        data.email || null,
        data.phone || null,
        data.mobile || null,
        data.title || null,
        data.department || null,
        data.contact_status,
        data.lead_source || null,
        leadScore,
        data.owner_id || req.user!.id,
        data.social_profiles ? JSON.stringify(data.social_profiles) : null,
        data.preferences ? JSON.stringify(data.preferences) : null,
        JSON.stringify(data.tags),
        JSON.stringify(data.custom_fields),
      ]
    );

    logger.info('Contact created', {
      contactId: result.rows[0].id,
      userId: req.user!.id,
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Update contact
 */
contactsRouter.put(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('contact'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = updateContactSchema.parse(req.body);
    const pool = getPool();

    if (data.email) {
      const emailCheck = await pool.query(
        'SELECT id FROM public.crm_contacts WHERE email = $1 AND company_id = $2 AND id != $3 AND deleted_at IS NULL',
        [data.email, req.user!.organization!.id, req.params.id]
      );

      if (emailCheck.rows.length > 0) {
        throw new AppError('Contact with this email already exists', 409);
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        paramCount++;
        if (['social_profiles', 'preferences', 'tags', 'custom_fields'].includes(key)) {
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
      `UPDATE public.crm_contacts SET ${updates.join(', ')}
       WHERE id = $${paramCount + 1} AND company_id = $${paramCount + 2} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Delete contact
 */
contactsRouter.delete(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  activityLogger('contact'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE public.crm_contacts SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }

    res.json({
      success: true,
      message: 'Contact deleted successfully',
    });
  })
);
