import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';




export const analyticsRouter = Router();
// 

// Enable authentication for all routes
analyticsRouter.use(authenticate);

/**
 * Get dashboard overview
 */
analyticsRouter.get(
  '/dashboard',
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    // Get counts for all entities
    const counts = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM public.crm_companies WHERE organization_id = $1 AND deleted_at IS NULL) as companies_count,
        (SELECT COUNT(*) FROM public.crm_contacts WHERE organization_id = $1 AND deleted_at IS NULL) as contacts_count,
        (SELECT COUNT(*) FROM public.crm_deals WHERE organization_id = $1 AND deleted_at IS NULL) as deals_count,
        (SELECT COUNT(*) FROM public.crm_tasks WHERE organization_id = $1 AND deleted_at IS NULL) as tasks_count,
        (SELECT COUNT(*) FROM public.crm_campaigns WHERE organization_id = $1 AND deleted_at IS NULL) as campaigns_count,
        (SELECT COUNT(*) FROM public.crm_projects WHERE organization_id = $1 AND deleted_at IS NULL) as projects_count`,
      [req.user!.organization!.id]
    );

    // Get deal pipeline stats
    const dealStats = await pool.query(
      `SELECT
        COUNT(*) as total_deals,
        SUM(CASE WHEN stage = 'closed_won' THEN 1 ELSE 0 END) as won_deals,
        SUM(CASE WHEN stage = 'closed_lost' THEN 1 ELSE 0 END) as lost_deals,
        SUM(CASE WHEN stage NOT IN ('closed_won', 'closed_lost') THEN 1 ELSE 0 END) as active_deals,
        SUM(CASE WHEN stage = 'closed_won' THEN amount ELSE 0 END) as won_revenue,
        SUM(CASE WHEN stage NOT IN ('closed_won', 'closed_lost') THEN amount ELSE 0 END) as pipeline_value
      FROM public.crm_deals
      WHERE organization_id = $1 AND deleted_at IS NULL`,
      [req.user!.organization!.id]
    );

    // Get task stats
    const taskStats = await pool.query(
      `SELECT
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
        SUM(CASE WHEN due_date < NOW() AND status != 'completed' THEN 1 ELSE 0 END) as overdue_tasks
      FROM public.crm_tasks
      WHERE organization_id = $1 AND deleted_at IS NULL`,
      [req.user!.organization!.id]
    );

    // Get recent activities
    const recentActivities = await pool.query(
      `SELECT
        a.*,
        u.email as user_email,
        CONCAT(u.first_name, ' ', u.last_name) as user_name
      FROM public.crm_activities a
      LEFT JOIN public.users u ON a.user_id = u.id

      WHERE a.company_id = $1
      ORDER BY a.created_at DESC
      LIMIT 10`,
      [req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: {
        counts: counts.rows[0],
        deal_stats: dealStats.rows[0],
        task_stats: taskStats.rows[0],
        recent_activities: recentActivities.rows,
      },
    });
  })
);

/**
 * Get sales analytics
 */
analyticsRouter.get(
  '/sales',
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    // Deal stage breakdown
    const stageBreakdown = await pool.query(
      `SELECT
        stage,
        COUNT(*) as count,
        SUM(amount) as total_value,
        AVG(amount) as avg_value,
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

    // Monthly revenue trend (last 12 months)
    const revenueTrend = await pool.query(
      `SELECT
        DATE_TRUNC('month', actual_close_date) as month,
        COUNT(*) as deals_closed,
        SUM(amount) as revenue
      FROM public.crm_deals
      WHERE organization_id = $1
        AND stage = 'closed_won'
        AND actual_close_date >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', actual_close_date)
      ORDER BY month DESC`,
      [req.user!.organization!.id]
    );

    // Top performers (users with most won deals)
    const topPerformers = await pool.query(
      `SELECT
        u.id,
        u.email,
        p.name,
        COUNT(*) as deals_won,
        SUM(d.amount) as total_revenue
      FROM public.crm_deals d
      INNER JOIN public.users u ON d.owner_id = u.id

      WHERE d.company_id = $1 AND d.stage = 'closed_won' AND d.deleted_at IS NULL
      GROUP BY u.id, u.email, p.name
      ORDER BY total_revenue DESC
      LIMIT 10`,
      [req.user!.organization!.id]
    );

    // Win rate
    const winRate = await pool.query(
      `SELECT
        COUNT(CASE WHEN stage = 'closed_won' THEN 1 END) as won,
        COUNT(CASE WHEN stage = 'closed_lost' THEN 1 END) as lost,
        COUNT(CASE WHEN stage IN ('closed_won', 'closed_lost') THEN 1 END) as total_closed
      FROM public.crm_deals
      WHERE organization_id = $1 AND deleted_at IS NULL`,
      [req.user!.organization!.id]
    );

    const won = parseInt(winRate.rows[0].won);
    const totalClosed = parseInt(winRate.rows[0].total_closed);
    const winRatePercent = totalClosed > 0 ? ((won / totalClosed) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        stage_breakdown: stageBreakdown.rows,
        revenue_trend: revenueTrend.rows,
        top_performers: topPerformers.rows,
        win_rate: {
          ...winRate.rows[0],
          win_rate_percent: winRatePercent,
        },
      },
    });
  })
);

/**
 * Get marketing analytics
 */
analyticsRouter.get(
  '/marketing',
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    // Campaign performance
    const campaignPerformance = await pool.query(
      `SELECT
        c.id,
        c.name,
        c.campaign_type,
        c.status,
        c.budget,
        c.actual_cost,
        COUNT(cc.id) as total_contacts,
        COUNT(CASE WHEN cc.status = 'opened' THEN 1 END) as opened_count,
        COUNT(CASE WHEN cc.status = 'clicked' THEN 1 END) as clicked_count
      FROM public.crm_campaigns c
      LEFT JOIN public.crm_campaign_contacts cc ON c.id = cc.campaign_id
      WHERE c.company_id = $1 AND c.deleted_at IS NULL
      GROUP BY c.id, c.name, c.campaign_type, c.status, c.budget, c.actual_cost
      ORDER BY c.created_at DESC
      LIMIT 20`,
      [req.user!.organization!.id]
    );

    // Lead source breakdown
    const leadSources = await pool.query(
      `SELECT
        lead_source,
        COUNT(*) as count,
        AVG(lead_score) as avg_lead_score
      FROM public.crm_contacts
      WHERE organization_id = $1 AND deleted_at IS NULL AND lead_source IS NOT NULL
      GROUP BY lead_source
      ORDER BY count DESC`,
      [req.user!.organization!.id]
    );

    // Contact status breakdown
    const contactStatus = await pool.query(
      `SELECT
        contact_status,
        COUNT(*) as count
      FROM public.crm_contacts
      WHERE organization_id = $1 AND deleted_at IS NULL
      GROUP BY contact_status`,
      [req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: {
        campaign_performance: campaignPerformance.rows,
        lead_sources: leadSources.rows,
        contact_status: contactStatus.rows,
      },
    });
  })
);

/**
 * Get project analytics
 */
analyticsRouter.get(
  '/projects',
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    // Project status breakdown
    const projectStatus = await pool.query(
      `SELECT
        project_status,
        COUNT(*) as count,
        AVG(CASE WHEN actual_hours IS NOT NULL THEN actual_hours ELSE 0 END) as avg_hours
      FROM public.crm_projects
      WHERE organization_id = $1 AND deleted_at IS NULL
      GROUP BY project_status`,
      [req.user!.organization!.id]
    );

    // Projects by priority
    const projectPriority = await pool.query(
      `SELECT
        priority,
        COUNT(*) as count
      FROM public.crm_projects
      WHERE organization_id = $1 AND deleted_at IS NULL
      GROUP BY priority`,
      [req.user!.organization!.id]
    );

    // Overdue projects
    const overdueProjects = await pool.query(
      `SELECT
        id, name, due_date, project_status, priority
      FROM public.crm_projects
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND due_date < NOW()
        AND project_status NOT IN ('completed', 'cancelled')
      ORDER BY due_date ASC`,
      [req.user!.organization!.id]
    );

    res.json({
      success: true,
      data: {
        status_breakdown: projectStatus.rows,
        priority_breakdown: projectPriority.rows,
        overdue_projects: overdueProjects.rows,
      },
    });
  })
);
