import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { logger } from '../utils/logger';




export const importRouter = Router();
// 

// Enable authentication for all routes
importRouter.use(authenticate);

/**
 * Helper function to parse CSV data
 */
function parseCSV(csvData: string): Array<Record<string, string>> {
  const lines = csvData.trim().split('\n');
  if (lines.length < 2) {
    throw new AppError('CSV must contain header row and at least one data row', 400);
  }

  // Parse header
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

  // Parse data rows
  const records: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote
          currentValue += '"';
          j++; // Skip next quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue); // Add last value

    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || '';
    });
    records.push(record);
  }

  return records;
}

/**
 * Helper function to parse JSON value from string
 */
function parseJSONField(value: string): any {
  if (!value || value === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Import companies from CSV
 */
importRouter.post(
  '/companies',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { csvData, dryRun } = req.body;

    if (!csvData) {
      throw new AppError('csvData is required', 400);
    }

    const pool = getPool();
    const records = parseCSV(csvData);
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; data: any }>,
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // Validate required fields
        if (!record.name) {
          throw new Error('name is required');
        }

        const tags = parseJSONField(record.tags) || [];
        const customFields = parseJSONField(record.custom_fields) || {};

        if (!dryRun) {
          await pool.query(
            `INSERT INTO public.crm_companies (
              organization_id, name, slug, website, industry, company_size,
              company_status, annual_revenue, employee_count, phone, email,
              address, city, state, country, postal_code, tags, custom_fields
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
              req.user!.organization!.id,
              record.name,
              record.slug || null,
              record.website || null,
              record.industry || null,
              record.company_size || null,
              record.company_status || 'lead',
              record.annual_revenue ? parseFloat(record.annual_revenue) : null,
              record.employee_count ? parseInt(record.employee_count) : null,
              record.phone || null,
              record.email || null,
              record.address || null,
              record.city || null,
              record.state || null,
              record.country || null,
              record.postal_code || null,
              JSON.stringify(tags),
              JSON.stringify(customFields),
            ]
          );
        }

        results.successful++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: i + 2, // +2 for header and 0-index
          error: error.message,
          data: record,
        });
      }
    }

    logger.info('Companies import completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      dryRun,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: results,
      message: dryRun
        ? 'Dry run completed - no data was imported'
        : `Import completed: ${results.successful} successful, ${results.failed} failed`,
    });
  })
);

/**
 * Import contacts from CSV
 */
importRouter.post(
  '/contacts',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { csvData, dryRun } = req.body;

    if (!csvData) {
      throw new AppError('csvData is required', 400);
    }

    const pool = getPool();
    const records = parseCSV(csvData);
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; data: any }>,
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // Validate required fields
        if (!record.first_name || !record.last_name) {
          throw new Error('first_name and last_name are required');
        }

        if (!record.email && !record.phone) {
          throw new Error('Either email or phone is required');
        }

        // Look up company_id if company_name provided
        let companyId = null;
        if (record.company_name) {
          const companyResult = await pool.query(
            `SELECT id FROM public.crm_companies
             WHERE organization_id = $1 AND name = $2 AND deleted_at IS NULL
             LIMIT 1`,
            [req.user!.organization!.id, record.company_name]
          );
          if (companyResult.rows.length > 0) {
            companyId = companyResult.rows[0].id;
          }
        }

        const tags = parseJSONField(record.tags) || [];
        const customFields = parseJSONField(record.custom_fields) || {};

        if (!dryRun) {
          await pool.query(
            `INSERT INTO public.crm_contacts (
              organization_id, first_name, last_name, email, phone, mobile,
              title, department, company_id, status, lead_source, lead_score,
              linkedin_url, twitter_handle, address, city, state, country,
              postal_code, tags, custom_fields
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
            [
              req.user!.organization!.id,
              record.first_name,
              record.last_name,
              record.email || null,
              record.phone || null,
              record.mobile || null,
              record.title || null,
              record.department || null,
              companyId,
              record.status || 'lead',
              record.lead_source || null,
              record.lead_score ? parseInt(record.lead_score) : null,
              record.linkedin_url || null,
              record.twitter_handle || null,
              record.address || null,
              record.city || null,
              record.state || null,
              record.country || null,
              record.postal_code || null,
              JSON.stringify(tags),
              JSON.stringify(customFields),
            ]
          );
        }

        results.successful++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: i + 2,
          error: error.message,
          data: record,
        });
      }
    }

    logger.info('Contacts import completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      dryRun,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: results,
      message: dryRun
        ? 'Dry run completed - no data was imported'
        : `Import completed: ${results.successful} successful, ${results.failed} failed`,
    });
  })
);

/**
 * Import deals from CSV
 */
importRouter.post(
  '/deals',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { csvData, dryRun } = req.body;

    if (!csvData) {
      throw new AppError('csvData is required', 400);
    }

    const pool = getPool();
    const records = parseCSV(csvData);
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; data: any }>,
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // Validate required fields
        if (!record.name) {
          throw new Error('name is required');
        }

        // Look up company_id if company_name provided
        let companyId = null;
        if (record.company_name) {
          const companyResult = await pool.query(
            `SELECT id FROM public.crm_companies
             WHERE organization_id = $1 AND name = $2 AND deleted_at IS NULL
             LIMIT 1`,
            [req.user!.organization!.id, record.company_name]
          );
          if (companyResult.rows.length > 0) {
            companyId = companyResult.rows[0].id;
          }
        }

        // Look up contact_id if contact email provided
        let contactId = null;
        if (record.contact_email) {
          const contactResult = await pool.query(
            `SELECT id FROM public.crm_contacts
             WHERE organization_id = $1 AND email = $2 AND deleted_at IS NULL
             LIMIT 1`,
            [req.user!.organization!.id, record.contact_email]
          );
          if (contactResult.rows.length > 0) {
            contactId = contactResult.rows[0].id;
          }
        }

        const tags = parseJSONField(record.tags) || [];
        const customFields = parseJSONField(record.custom_fields) || {};

        if (!dryRun) {
          await pool.query(
            `INSERT INTO public.crm_deals (
              organization_id, name, company_id, primary_contact_id, amount,
              stage, probability, expected_close_date, close_date, lost_reason,
              next_step, description, tags, custom_fields
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              req.user!.organization!.id,
              record.name,
              companyId,
              contactId,
              record.amount ? parseFloat(record.amount) : null,
              record.stage || 'prospecting',
              record.probability ? parseInt(record.probability) : null,
              record.expected_close_date || null,
              record.close_date || null,
              record.lost_reason || null,
              record.next_step || null,
              record.description || null,
              JSON.stringify(tags),
              JSON.stringify(customFields),
            ]
          );
        }

        results.successful++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: i + 2,
          error: error.message,
          data: record,
        });
      }
    }

    logger.info('Deals import completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      dryRun,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: results,
      message: dryRun
        ? 'Dry run completed - no data was imported'
        : `Import completed: ${results.successful} successful, ${results.failed} failed`,
    });
  })
);

/**
 * Import tasks from CSV
 */
importRouter.post(
  '/tasks',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { csvData, dryRun } = req.body;

    if (!csvData) {
      throw new AppError('csvData is required', 400);
    }

    const pool = getPool();
    const records = parseCSV(csvData);
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; data: any }>,
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        // Validate required fields
        if (!record.title) {
          throw new Error('title is required');
        }

        const tags = parseJSONField(record.tags) || [];
        const customFields = parseJSONField(record.custom_fields) || {};

        if (!dryRun) {
          await pool.query(
            `INSERT INTO public.crm_tasks (
              organization_id, title, description, status, priority,
              due_date, completed_at, related_to_type, related_to_id,
              tags, custom_fields, assigned_to_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              req.user!.organization!.id,
              record.title,
              record.description || null,
              record.status || 'pending',
              record.priority || 'medium',
              record.due_date || null,
              record.completed_at || null,
              record.related_to_type || null,
              record.related_to_id || null,
              JSON.stringify(tags),
              JSON.stringify(customFields),
              req.user!.id, // Assign to current user
            ]
          );
        }

        results.successful++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          row: i + 2,
          error: error.message,
          data: record,
        });
      }
    }

    logger.info('Tasks import completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      dryRun,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: results,
      message: dryRun
        ? 'Dry run completed - no data was imported'
        : `Import completed: ${results.successful} successful, ${results.failed} failed`,
    });
  })
);

/**
 * Validate import data without importing
 */
importRouter.post(
  '/validate',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('admin'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { csvData, entityType } = req.body;

    if (!csvData) {
      throw new AppError('csvData is required', 400);
    }

    if (!['companies', 'contacts', 'deals', 'tasks'].includes(entityType)) {
      throw new AppError('Invalid entityType. Must be: companies, contacts, deals, or tasks', 400);
    }

    try {
      const records = parseCSV(csvData);

      // Validate headers based on entity type
      const requiredHeaders: Record<string, string[]> = {
        companies: ['name'],
        contacts: ['first_name', 'last_name'],
        deals: ['name'],
        tasks: ['title'],
      };

      const required = requiredHeaders[entityType];
      const firstRecord = records[0] || {};
      const missingHeaders = required.filter((h) => !(h in firstRecord));

      res.json({
        success: true,
        data: {
          valid: missingHeaders.length === 0,
          recordCount: records.length,
          headers: Object.keys(firstRecord),
          missingHeaders,
          sampleRecords: records.slice(0, 5),
        },
      });
    } catch (error: any) {
      res.json({
        success: false,
        error: error.message,
      });
    }
  })
);
