import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { logger } from '../utils/logger';




export const exportRouter = Router();
// 

// Enable authentication for all routes
exportRouter.use(authenticate);

/**
 * Helper function to convert rows to CSV
 */
function convertToCSV(rows: any[], columns: string[]): string {
  if (rows.length === 0) {
    return columns.join(',') + '\n';
  }

  // Header row
  const header = columns.join(',');

  // Data rows
  const dataRows = rows.map((row) => {
    return columns
      .map((col) => {
        const value = row[col];
        if (value === null || value === undefined) {
          return '';
        }
        // Handle objects and arrays
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        // Escape quotes and wrap in quotes if contains comma or quote
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(',');
  });

  return header + '\n' + dataRows.join('\n');
}

/**
 * Helper function to build export query
 */
function buildExportQuery(
  table: string,
  organizationId: string,
  filters?: Record<string, any>
): { query: string; values: any[] } {
  let query = `SELECT * FROM public.${table} WHERE company_id = $1 AND deleted_at IS NULL`;
  const values: any[] = [organizationId];
  let paramCount = 1;

  if (filters) {
    if (filters.status) {
      values.push(filters.status);
      query += ` AND status = $${++paramCount}`;
    }
    if (filters.company_status) {
      values.push(filters.company_status);
      query += ` AND company_status = $${++paramCount}`;
    }
    if (filters.stage) {
      values.push(filters.stage);
      query += ` AND stage = $${++paramCount}`;
    }
    if (filters.priority) {
      values.push(filters.priority);
      query += ` AND priority = $${++paramCount}`;
    }
    if (filters.created_after) {
      values.push(filters.created_after);
      query += ` AND created_at >= $${++paramCount}`;
    }
    if (filters.created_before) {
      values.push(filters.created_before);
      query += ` AND created_at <= $${++paramCount}`;
    }
  }

  query += ' ORDER BY created_at DESC';

  return { query, values };
}

/**
 * Export companies
 */
exportRouter.get(
  '/companies',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();
    const format = (req.query.format as string) || 'csv';
    const filters = req.query;

    const { query, values } = buildExportQuery('crm_companies', req.user!.organization!.id, filters);
    const result = await pool.query(query, values);

    const columns = [
      'id',
      'name',
      'slug',
      'website',
      'industry',
      'company_size',
      'company_status',
      'annual_revenue',
      'employee_count',
      'phone',
      'email',
      'address',
      'city',
      'state',
      'country',
      'postal_code',
      'tags',
      'custom_fields',
      'created_at',
      'updated_at',
    ];

    if (format === 'csv') {
      const csv = convertToCSV(result.rows, columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=companies_${Date.now()}.csv`);
      res.send(csv);
    } else {
      // Return JSON for Excel processing on client side
      res.json({
        success: true,
        data: result.rows,
        columns,
        count: result.rows.length,
      });
    }

    logger.info('Companies exported', {
      format,
      count: result.rows.length,
      userId: req.user!.id,
    });
  })
);

/**
 * Export contacts
 */
exportRouter.get(
  '/contacts',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();
    const format = (req.query.format as string) || 'csv';
    const filters = req.query;

    // Enhanced query with company information
    let query = `
      SELECT
        c.*,
        comp.name as company_name
      FROM public.crm_contacts c
      LEFT JOIN public.crm_companies comp ON c.crm_company_id = comp.id
      WHERE c.company_id = $1 AND c.deleted_at IS NULL
    `;
    const values: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (filters.status) {
      values.push(filters.status);
      query += ` AND c.status = $${++paramCount}`;
    }
    if (filters.created_after) {
      values.push(filters.created_after);
      query += ` AND c.created_at >= $${++paramCount}`;
    }
    if (filters.created_before) {
      values.push(filters.created_before);
      query += ` AND c.created_at <= $${++paramCount}`;
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, values);

    const columns = [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'mobile',
      'title',
      'department',
      'company_name',
      'status',
      'lead_source',
      'lead_score',
      'linkedin_url',
      'twitter_handle',
      'address',
      'city',
      'state',
      'country',
      'postal_code',
      'tags',
      'custom_fields',
      'created_at',
      'updated_at',
    ];

    if (format === 'csv') {
      const csv = convertToCSV(result.rows, columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=contacts_${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: result.rows,
        columns,
        count: result.rows.length,
      });
    }

    logger.info('Contacts exported', {
      format,
      count: result.rows.length,
      userId: req.user!.id,
    });
  })
);

/**
 * Export deals
 */
exportRouter.get(
  '/deals',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();
    const format = (req.query.format as string) || 'csv';
    const filters = req.query;

    // Enhanced query with related information
    let query = `
      SELECT
        d.*,
        comp.name as company_name,
        c.first_name || ' ' || c.last_name as contact_name
      FROM public.crm_deals d
      LEFT JOIN public.crm_companies comp ON d.company_id = comp.id
      LEFT JOIN public.crm_contacts c ON d.primary_contact_id = c.id
      WHERE d.company_id = $1 AND d.deleted_at IS NULL
    `;
    const values: any[] = [req.user!.organization!.id];
    let paramCount = 1;

    if (filters.stage) {
      values.push(filters.stage);
      query += ` AND d.stage = $${++paramCount}`;
    }
    if (filters.created_after) {
      values.push(filters.created_after);
      query += ` AND d.created_at >= $${++paramCount}`;
    }
    if (filters.created_before) {
      values.push(filters.created_before);
      query += ` AND d.created_at <= $${++paramCount}`;
    }

    query += ' ORDER BY d.created_at DESC';

    const result = await pool.query(query, values);

    const columns = [
      'id',
      'name',
      'company_name',
      'contact_name',
      'amount',
      'stage',
      'probability',
      'expected_close_date',
      'close_date',
      'lost_reason',
      'next_step',
      'description',
      'tags',
      'custom_fields',
      'created_at',
      'updated_at',
    ];

    if (format === 'csv') {
      const csv = convertToCSV(result.rows, columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=deals_${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: result.rows,
        columns,
        count: result.rows.length,
      });
    }

    logger.info('Deals exported', {
      format,
      count: result.rows.length,
      userId: req.user!.id,
    });
  })
);

/**
 * Export tasks
 */
exportRouter.get(
  '/tasks',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();
    const format = (req.query.format as string) || 'csv';
    const filters = req.query;

    const { query, values } = buildExportQuery('crm_tasks', req.user!.organization!.id, filters);
    const result = await pool.query(query, values);

    const columns = [
      'id',
      'title',
      'description',
      'status',
      'priority',
      'due_date',
      'completed_at',
      'related_to_type',
      'related_to_id',
      'tags',
      'custom_fields',
      'created_at',
      'updated_at',
    ];

    if (format === 'csv') {
      const csv = convertToCSV(result.rows, columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=tasks_${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: result.rows,
        columns,
        count: result.rows.length,
      });
    }

    logger.info('Tasks exported', {
      format,
      count: result.rows.length,
      userId: req.user!.id,
    });
  })
);

/**
 * Export campaigns
 */
exportRouter.get(
  '/campaigns',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();
    const format = (req.query.format as string) || 'csv';
    const filters = req.query;

    const { query, values } = buildExportQuery('crm_campaigns', req.user!.organization!.id, filters);
    const result = await pool.query(query, values);

    const columns = [
      'id',
      'name',
      'campaign_type',
      'status',
      'start_date',
      'end_date',
      'budget',
      'actual_cost',
      'description',
      'target_audience',
      'goals',
      'tags',
      'custom_fields',
      'created_at',
      'updated_at',
    ];

    if (format === 'csv') {
      const csv = convertToCSV(result.rows, columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=campaigns_${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: result.rows,
        columns,
        count: result.rows.length,
      });
    }

    logger.info('Campaigns exported', {
      format,
      count: result.rows.length,
      userId: req.user!.id,
    });
  })
);

/**
 * Export projects
 */
exportRouter.get(
  '/projects',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();
    const format = (req.query.format as string) || 'csv';
    const filters = req.query;

    const { query, values } = buildExportQuery('crm_projects', req.user!.organization!.id, filters);
    const result = await pool.query(query, values);

    const columns = [
      'id',
      'name',
      'status',
      'priority',
      'start_date',
      'end_date',
      'estimated_hours',
      'actual_hours',
      'budget',
      'description',
      'tags',
      'custom_fields',
      'created_at',
      'updated_at',
    ];

    if (format === 'csv') {
      const csv = convertToCSV(result.rows, columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=projects_${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: result.rows,
        columns,
        count: result.rows.length,
      });
    }

    logger.info('Projects exported', {
      format,
      count: result.rows.length,
      userId: req.user!.id,
    });
  })
);

/**
 * Export activities (audit trail)
 */
exportRouter.get(
  '/activities',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();
    const format = (req.query.format as string) || 'csv';

    const query = `
      SELECT
        a.*,
        u.email as user_email
      FROM public.crm_activities a
      LEFT JOIN public.users u ON a.user_id = u.id
      WHERE a.company_id = $1
      ORDER BY a.created_at DESC
      LIMIT 10000
    `;

    const result = await pool.query(query, [req.user!.organization!.id]);

    const columns = [
      'id',
      'activity_type',
      'entity_type',
      'entity_id',
      'description',
      'user_email',
      'metadata',
      'created_at',
    ];

    if (format === 'csv') {
      const csv = convertToCSV(result.rows, columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=activities_${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: result.rows,
        columns,
        count: result.rows.length,
      });
    }

    logger.info('Activities exported', {
      format,
      count: result.rows.length,
      userId: req.user!.id,
    });
  })
);
