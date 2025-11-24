import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';




export const searchRouter = Router();
// 

// Enable authentication for all routes
searchRouter.use(authenticate);

/**
 * Global search across all CRM entities
 */
searchRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res) => {
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      throw new AppError('Search query must be at least 2 characters', 400);
    }

    const pool = getPool();
    const searchPattern = `%${query}%`;

    // Search companies
    const companies = await pool.query(
      `SELECT
        id, 'company' as type, name, industry, company_status as status, created_at
      FROM public.crm_companies
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND (name ILIKE $2 OR website ILIKE $2 OR industry ILIKE $2)
      LIMIT 10`,
      [req.user!.organization!.id, searchPattern]
    );

    // Search contacts
    const contacts = await pool.query(
      `SELECT
        id, 'contact' as type,
        first_name || ' ' || last_name as name,
        email, contact_status as status, created_at
      FROM public.crm_contacts
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND (first_name ILIKE $2 OR last_name ILIKE $2 OR email ILIKE $2 OR title ILIKE $2)
      LIMIT 10`,
      [req.user!.organization!.id, searchPattern]
    );

    // Search deals
    const deals = await pool.query(
      `SELECT
        id, 'deal' as type, name, stage as status, amount, created_at
      FROM public.crm_deals
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND name ILIKE $2
      LIMIT 10`,
      [req.user!.organization!.id, searchPattern]
    );

    // Search tasks
    const tasks = await pool.query(
      `SELECT
        id, 'task' as type, title as name, status, priority, created_at
      FROM public.crm_tasks
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND (title ILIKE $2 OR description ILIKE $2)
      LIMIT 10`,
      [req.user!.organization!.id, searchPattern]
    );

    // Search campaigns
    const campaigns = await pool.query(
      `SELECT
        id, 'campaign' as type, name, campaign_type, status, created_at
      FROM public.crm_campaigns
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND (name ILIKE $2 OR description ILIKE $2)
      LIMIT 10`,
      [req.user!.organization!.id, searchPattern]
    );

    // Search projects
    const projects = await pool.query(
      `SELECT
        id, 'project' as type, name, project_status as status, priority, created_at
      FROM public.crm_projects
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND (name ILIKE $2 OR description ILIKE $2)
      LIMIT 10`,
      [req.user!.organization!.id, searchPattern]
    );

    res.json({
      success: true,
      query,
      data: {
        companies: companies.rows,
        contacts: contacts.rows,
        deals: deals.rows,
        tasks: tasks.rows,
        campaigns: campaigns.rows,
        projects: projects.rows,
      },
      total_results:
        companies.rows.length +
        contacts.rows.length +
        deals.rows.length +
        tasks.rows.length +
        campaigns.rows.length +
        projects.rows.length,
    });
  })
);

/**
 * Search specific entity type
 */
searchRouter.get(
  '/:entity',
  asyncHandler(async (req: AuthRequest, res) => {
    const entity = req.params.entity;
    const query = req.query.q as string;

    if (!query || query.length < 2) {
      throw new AppError('Search query must be at least 2 characters', 400);
    }

    const validEntities = ['companies', 'contacts', 'deals', 'tasks', 'campaigns', 'projects'];
    if (!validEntities.includes(entity)) {
      throw new AppError('Invalid entity type', 400);
    }

    const pool = getPool();
    const searchPattern = `%${query}%`;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    let result;

    switch (entity) {
      case 'companies':
        result = await pool.query(
          `SELECT * FROM public.crm_companies
           WHERE organization_id = $1 AND deleted_at IS NULL
             AND (name ILIKE $2 OR website ILIKE $2 OR industry ILIKE $2)
           ORDER BY created_at DESC
           LIMIT $3`,
          [req.user!.organization!.id, searchPattern, limit]
        );
        break;

      case 'contacts':
        result = await pool.query(
          `SELECT * FROM public.crm_contacts
           WHERE organization_id = $1 AND deleted_at IS NULL
             AND (first_name ILIKE $2 OR last_name ILIKE $2 OR email ILIKE $2 OR title ILIKE $2)
           ORDER BY created_at DESC
           LIMIT $3`,
          [req.user!.organization!.id, searchPattern, limit]
        );
        break;

      case 'deals':
        result = await pool.query(
          `SELECT * FROM public.crm_deals
           WHERE organization_id = $1 AND deleted_at IS NULL
             AND (name ILIKE $2 OR description ILIKE $2)
           ORDER BY created_at DESC
           LIMIT $3`,
          [req.user!.organization!.id, searchPattern, limit]
        );
        break;

      case 'tasks':
        result = await pool.query(
          `SELECT * FROM public.crm_tasks
           WHERE organization_id = $1 AND deleted_at IS NULL
             AND (title ILIKE $2 OR description ILIKE $2)
           ORDER BY created_at DESC
           LIMIT $3`,
          [req.user!.organization!.id, searchPattern, limit]
        );
        break;

      case 'campaigns':
        result = await pool.query(
          `SELECT * FROM public.crm_campaigns
           WHERE organization_id = $1 AND deleted_at IS NULL
             AND (name ILIKE $2 OR description ILIKE $2)
           ORDER BY created_at DESC
           LIMIT $3`,
          [req.user!.organization!.id, searchPattern, limit]
        );
        break;

      case 'projects':
        result = await pool.query(
          `SELECT * FROM public.crm_projects
           WHERE organization_id = $1 AND deleted_at IS NULL
             AND (name ILIKE $2 OR description ILIKE $2)
           ORDER BY created_at DESC
           LIMIT $3`,
          [req.user!.organization!.id, searchPattern, limit]
        );
        break;
    }

    res.json({
      success: true,
      entity,
      query,
      data: result!.rows,
      count: result!.rows.length,
    });
  })
);
