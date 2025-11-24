import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { aiService } from '../services/ai-service';
import { logger } from '../utils/logger';




export const aiRouter = Router();
// 

// Enable authentication for all routes
aiRouter.use(authenticate);

/**
 * Score a contact using AI
 */
aiRouter.post(
  '/score-contact/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    // Get contact with company info
    const result = await pool.query(
      `SELECT
        c.*,
        comp.name as company_name,
        comp.industry as company_industry,
        comp.company_size,
        comp.annual_revenue
      FROM public.crm_contacts c
      LEFT JOIN public.crm_companies comp ON c.crm_company_id = comp.id
      WHERE c.id = $1 AND c.crm_company_id = $2 AND c.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }

    const contact = result.rows[0];

    // Score the contact
    const scoring = await aiService.scoreContact({
      firstName: contact.first_name,
      lastName: contact.last_name,
      email: contact.email,
      title: contact.title,
      company: contact.company_name
        ? {
            name: contact.company_name,
            industry: contact.company_industry,
            companySize: contact.company_size,
            annualRevenue: contact.annual_revenue,
          }
        : undefined,
      leadSource: contact.lead_source,
    });

    // Update contact with new score
    await pool.query(
      `UPDATE public.crm_contacts
       SET lead_score = $1, updated_at = NOW()
       WHERE id = $2`,
      [scoring.score, req.params.id]
    );

    logger.info('Contact scored with AI', {
      contactId: req.params.id,
      score: scoring.score,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: {
        contactId: req.params.id,
        score: scoring.score,
        previousScore: contact.lead_score,
        reasoning: scoring.reasoning,
        factors: scoring.factors,
      },
    });
  })
);

/**
 * Generate email draft for a contact
 */
aiRouter.post(
  '/generate-email/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { purpose, additionalContext, tone } = req.body;
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        c.*,
        comp.name as company_name
      FROM public.crm_contacts c
      LEFT JOIN public.crm_companies comp ON c.crm_company_id = comp.id
      WHERE c.id = $1 AND c.crm_company_id = $2 AND c.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }

    const contact = result.rows[0];

    const email = await aiService.generateEmailDraft({
      recipientName: `${contact.first_name} ${contact.last_name}`,
      recipientTitle: contact.title,
      companyName: contact.company_name,
      purpose: purpose || 'introduction',
      additionalContext,
      tone: tone || 'professional',
    });

    logger.info('Email draft generated', {
      contactId: req.params.id,
      purpose,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: email,
    });
  })
);

/**
 * Predict deal outcome
 */
aiRouter.post(
  '/predict-deal/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
        d.*,
        comp.name as company_name,
        c.title as contact_title,
        (SELECT MAX(a.created_at) FROM public.crm_activities a WHERE a.entity_type = 'deal' AND a.entity_id = d.id) as last_activity_date
      FROM public.crm_deals d
      LEFT JOIN public.crm_companies comp ON d.company_id = comp.id
      LEFT JOIN public.crm_contacts c ON d.primary_contact_id = c.id
      WHERE d.id = $1 AND d.company_id = $2 AND d.deleted_at IS NULL`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Deal not found', 404);
    }

    const deal = result.rows[0];
    const dealAge = Math.floor(
      (new Date().getTime() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const prediction = await aiService.predictDealOutcome({
      name: deal.name,
      amount: deal.amount,
      stage: deal.stage,
      companyName: deal.company_name,
      contactTitle: deal.contact_title,
      dealAge,
      lastActivityDate: deal.last_activity_date,
    });

    logger.info('Deal prediction generated', {
      dealId: req.params.id,
      winProbability: prediction.winProbability,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: {
        dealId: req.params.id,
        currentProbability: deal.probability,
        aiPrediction: prediction,
      },
    });
  })
);

/**
 * Generate insights for an entity
 */
aiRouter.post(
  '/insights/:entityType/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { entityType, id } = req.params;
    const pool = getPool();

    const validTypes = ['company', 'contact', 'deal', 'project'];
    if (!validTypes.includes(entityType)) {
      throw new AppError('Invalid entity type', 400);
    }

    // Get entity name
    let entityName = '';
    const tableMap: Record<string, string> = {
      company: 'crm_companies',
      contact: 'crm_contacts',
      deal: 'crm_deals',
      project: 'crm_projects',
    };

    const nameFieldMap: Record<string, string> = {
      company: 'name',
      contact: "first_name || ' ' || last_name",
      deal: 'name',
      project: 'name',
    };

    const entityResult = await pool.query(
      `SELECT ${nameFieldMap[entityType]} as name FROM public.${tableMap[entityType]} WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [id, req.user!.organization!.id]
    );

    if (entityResult.rows.length === 0) {
      throw new AppError(`${entityType} not found`, 404);
    }

    entityName = entityResult.rows[0].name;

    // Get notes
    const notes = await pool.query(
      `SELECT content, created_at FROM public.crm_notes
       WHERE related_to_type = $1 AND related_to_id = $2 AND company_id = $3 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 20`,
      [entityType, id, req.user!.organization!.id]
    );

    // Get activities
    const activities = await pool.query(
      `SELECT activity_type, description, created_at FROM public.crm_activities
       WHERE entity_type = $1 AND entity_id = $2 AND company_id = $3
       ORDER BY created_at DESC LIMIT 20`,
      [entityType, id, req.user!.organization!.id]
    );

    const insights = await aiService.generateInsights({
      entityType,
      entityName,
      notes: notes.rows.map((n) => ({ content: n.content, createdAt: new Date(n.created_at) })),
      activities: activities.rows.map((a) => ({
        type: a.activity_type,
        description: a.description,
        createdAt: new Date(a.created_at),
      })),
    });

    logger.info('Insights generated', {
      entityType,
      entityId: id,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: insights,
    });
  })
);

/**
 * Suggest next best action
 */
aiRouter.post(
  '/suggest-action/:entityType/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { entityType, id } = req.params;
    const pool = getPool();

    const validTypes = ['contact', 'deal', 'company'];
    if (!validTypes.includes(entityType)) {
      throw new AppError('Invalid entity type', 400);
    }

    // Get entity data
    const tableMap: Record<string, string> = {
      company: 'crm_companies',
      contact: 'crm_contacts',
      deal: 'crm_deals',
    };

    const entityResult = await pool.query(
      `SELECT * FROM public.${tableMap[entityType]} WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [id, req.user!.organization!.id]
    );

    if (entityResult.rows.length === 0) {
      throw new AppError(`${entityType} not found`, 404);
    }

    // Get recent activities
    const activities = await pool.query(
      `SELECT activity_type, description, created_at FROM public.crm_activities
       WHERE entity_type = $1 AND entity_id = $2 AND company_id = $3
       ORDER BY created_at DESC LIMIT 10`,
      [entityType, id, req.user!.organization!.id]
    );

    const suggestion = await aiService.suggestNextAction({
      entityType: entityType as 'contact' | 'deal' | 'company',
      entityData: entityResult.rows[0],
      recentActivities: activities.rows.map((a) => ({
        type: a.activity_type,
        description: a.description,
        date: new Date(a.created_at),
      })),
    });

    logger.info('Action suggested', {
      entityType,
      entityId: id,
      action: suggestion.action,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: suggestion,
    });
  })
);

/**
 * Batch score multiple contacts
 */
aiRouter.post(
  '/batch-score-contacts',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { contactIds } = req.body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      throw new AppError('Invalid contact IDs array', 400);
    }

    if (contactIds.length > 50) {
      throw new AppError('Maximum 50 contacts per batch', 400);
    }

    const pool = getPool();
    const results = [];

    for (const contactId of contactIds) {
      try {
        const result = await pool.query(
          `SELECT c.*, comp.name as company_name, comp.industry as company_industry,
           comp.company_size, comp.annual_revenue
           FROM public.crm_contacts c
           LEFT JOIN public.crm_companies comp ON c.crm_company_id = comp.id
           WHERE c.id = $1 AND c.crm_company_id = $2 AND c.deleted_at IS NULL`,
          [contactId, req.user!.organization!.id]
        );

        if (result.rows.length > 0) {
          const contact = result.rows[0];
          const scoring = await aiService.scoreContact({
            firstName: contact.first_name,
            lastName: contact.last_name,
            email: contact.email,
            title: contact.title,
            company: contact.company_name
              ? {
                  name: contact.company_name,
                  industry: contact.company_industry,
                  companySize: contact.company_size,
                  annualRevenue: contact.annual_revenue,
                }
              : undefined,
            leadSource: contact.lead_source,
          });

          await pool.query(
            `UPDATE public.crm_contacts SET lead_score = $1, updated_at = NOW() WHERE id = $2`,
            [scoring.score, contactId]
          );

          results.push({
            contactId,
            score: scoring.score,
            success: true,
          });
        }
      } catch (error) {
        results.push({
          contactId,
          success: false,
          error: 'Failed to score contact',
        });
      }
    }

    logger.info('Batch contact scoring completed', {
      totalContacts: contactIds.length,
      successful: results.filter((r) => r.success).length,
      userId: req.user!.id,
    });

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: contactIds.length,
          successful: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        },
      },
    });
  })
);
