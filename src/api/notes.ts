import { Router } from 'express';
import { getPool } from '../database/connection';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, requireOrganizationRole } from '../middleware/auth';
import { activityLogger } from '../middleware/activityLogger';
import { createNoteSchema, updateNoteSchema } from '../validation/crm-schemas';
import { logger } from '../utils/logger';




export const notesRouter = Router();
// 

// Enable authentication for all routes
notesRouter.use(authenticate);

/**
 * Create note
 */
notesRouter.post(
  '/',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('note'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = createNoteSchema.parse(req.body);
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO public.crm_notes (
        organization_id, content, related_to_type, related_to_id,
        created_by_id, is_pinned, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *`,
      [
        req.user!.organization!.id,
        data.content,
        data.related_to_type || null,
        data.related_to_id || null,
        req.user!.id,
        data.is_pinned || false,
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Update note
 */
notesRouter.put(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('note'),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = updateNoteSchema.parse(req.body);
    const pool = getPool();

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (data.content !== undefined) {
      paramCount++;
      updates.push(`content = $${paramCount}`);
      values.push(data.content);
    }

    if (data.is_pinned !== undefined) {
      paramCount++;
      updates.push(`is_pinned = $${paramCount}`);
      values.push(data.is_pinned);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id, req.user!.organization!.id);

    const result = await pool.query(
      `UPDATE public.crm_notes SET ${updates.join(', ')}
       WHERE id = $${paramCount + 1} AND organization_id = $${paramCount + 2} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Note not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  })
);

/**
 * Delete note
 */
notesRouter.delete(
  '/:id',
  // TODO: Re-enable role check after Phase 3
  // requireOrganizationRole('member'),
  activityLogger('note'),
  asyncHandler(async (req: AuthRequest, res) => {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE public.crm_notes SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user!.organization!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Note not found', 404);
    }

    res.json({
      success: true,
      message: 'Note deleted successfully',
    });
  })
);
