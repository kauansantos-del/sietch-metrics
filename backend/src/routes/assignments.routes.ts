import { Router, type NextFunction, type Request, type Response } from 'express';
import { logAudit } from '../middleware/audit';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  bulkAssignSchema,
  createAssignmentSchema,
  listMyAssignmentsQuerySchema,
  updateModuleProgressSchema,
} from '../schemas/training.schema';
import {
  assertCanView,
  bulkAssign,
  createAssignment,
  getAssignmentDetail,
  getAssignmentForUser,
  listAssignmentsForUser,
  listMyAssignments,
  summaryForUser,
} from '../services/assignment.service';
import {
  completeModule,
  startModule,
  updateProgress,
} from '../services/module-progress.service';

const router = Router();

router.use(requireAuth);

// ─── Minhas atribuições (colaborador) ────────────────────────

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listMyAssignmentsQuerySchema.parse(req.query);
    const result = await listMyAssignments(req.user!.userId, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await summaryForUser(req.user!.userId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.get('/me/:assignmentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const detail = await getAssignmentDetail(req.user!.userId, req.params.assignmentId);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

// ─── Progresso de módulos (colaborador) ──────────────────────

router.post(
  '/me/:assignmentId/modules/:moduleId/start',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const progress = await startModule(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
      );
      res.json({ progress });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/me/:assignmentId/modules/:moduleId/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const progress = await completeModule(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
      );

      await logAudit({
        userId: req.user!.userId,
        action: 'module.completed',
        entityType: 'module_progress',
        entityId: progress.id,
        metadata: { assignmentId: req.params.assignmentId, moduleId: req.params.moduleId },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.json({ progress });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/:assignmentId/modules/:moduleId/progress',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateModuleProgressSchema.parse(req.body);
      const progress = await updateProgress(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
        data,
      );
      res.json({ progress });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Admin: atribuir e listar de outros usuários ─────────────

router.post(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createAssignmentSchema.parse(req.body);
      const assignment = await createAssignment(data, req.user!.userId);

      await logAudit({
        userId: req.user!.userId,
        action: 'assignment.created',
        entityType: 'assignment',
        entityId: assignment.id,
        metadata: { userId: data.userId, trainingId: data.trainingId },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json({ assignment });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/bulk',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = bulkAssignSchema.parse(req.body);
      const result = await bulkAssign(data, req.user!.userId);

      await logAudit({
        userId: req.user!.userId,
        action: 'assignment.bulk_created',
        entityType: 'training',
        entityId: data.trainingId,
        metadata: { total: result.total, succeeded: result.succeeded, failed: result.failed },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/users/:userId',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertCanView(req.user!.role, req.user!.userId, req.params.userId);
      const query = listMyAssignmentsQuerySchema.parse(req.query);
      const result = await listAssignmentsForUser(req.params.userId, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/users/:userId/:assignmentId',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertCanView(req.user!.role, req.user!.userId, req.params.userId);
      const detail = await getAssignmentForUser(req.params.userId, req.params.assignmentId);
      res.json(detail);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
