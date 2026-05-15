// Drill-down do colaborador — task-progressao-colaborador.md
// Admin/RH acessa qualquer; colaborador acessa apenas o próprio
//
// Permissões aplicadas aqui (Fase 4):
// - SUPER_ADMIN/ADMIN: vê qualquer userId
// - Colaborador: 'me' ou seu próprio userId — outros retornam 403

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { ForbiddenError } from '../utils/errors';
import {
  getAssignmentDrilldown,
  getTimeline,
  getTrainingSummary,
} from '../services/colaborador.service';

const router = Router();

router.use(requireAuth);

function resolveTargetUserId(req: Request, paramName = 'userId'): string {
  const raw = req.params[paramName];
  if (raw === 'me') return req.user!.userId;
  return raw!;
}

function assertCanView(req: Request, targetUserId: string) {
  const { role, userId } = req.user!;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return;
  if (userId === targetUserId) return;
  throw new ForbiddenError(
    'FORBIDDEN_ROLE',
    'Sem permissão para ver dados de outro colaborador',
  );
}

// ─── Summary (header + KPIs + alertas) ───────────────────────

router.get(
  '/users/:userId/training-summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = resolveTargetUserId(req);
      assertCanView(req, targetUserId);
      const summary = await getTrainingSummary(targetUserId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Drill-down de uma atribuição ────────────────────────────

router.get(
  '/users/:userId/assignments/:assignmentId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = resolveTargetUserId(req);
      assertCanView(req, targetUserId);
      const detail = await getAssignmentDrilldown(targetUserId, req.params.assignmentId);
      res.json(detail);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Timeline ────────────────────────────────────────────────

const timelineQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  types: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .optional(),
  training_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  '/users/:userId/activity',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = resolveTargetUserId(req);
      assertCanView(req, targetUserId);
      const query = timelineQuerySchema.parse(req.query);
      const result = await getTimeline(targetUserId, {
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        types: query.types,
        trainingId: query.training_id,
        cursor: query.cursor,
        limit: query.limit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
