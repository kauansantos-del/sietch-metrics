import { Router, type NextFunction, type Request, type Response } from 'express';
import { logAudit } from '../middleware/audit';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  createModuleSchema,
  createTrainingSchema,
  listTrainingsQuerySchema,
  reorderModulesSchema,
  updateModuleSchema,
  updateTrainingSchema,
} from '../schemas/training.schema';
import {
  archiveTraining,
  createTraining,
  getTrainingById,
  listTrainings,
  publishTraining,
  unpublishTraining,
  updateTraining,
  validateTrainingForPublish,
} from '../services/training.service';
import {
  createModule,
  deleteModule,
  listModules,
  reorderModules,
  updateModule,
} from '../services/module.service';

const router = Router();

router.use(requireAuth);

// ─── Catálogo ────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listTrainingsQuerySchema.parse(req.query);
    const result = await listTrainings(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const training = await getTrainingById(req.params.id);
    res.json({ training });
  } catch (err) {
    next(err);
  }
});

// ─── Admin/RH: CRUD ──────────────────────────────────────────

router.post(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createTrainingSchema.parse(req.body);
      const training = await createTraining(req.user!.userId, data);

      await logAudit({
        userId: req.user!.userId,
        action: 'training.created',
        entityType: 'training',
        entityId: training.id,
        metadata: { title: training.title, category: training.category },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json({ training });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateTrainingSchema.parse(req.body);
      const training = await updateTraining(req.params.id, data);

      await logAudit({
        userId: req.user!.userId,
        action: 'training.updated',
        entityType: 'training',
        entityId: training.id,
        metadata: { fields: Object.keys(data) },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.json({ training });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/archive',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const training = await archiveTraining(req.params.id);
      await logAudit({
        userId: req.user!.userId,
        action: 'training.archived',
        entityType: 'training',
        entityId: training.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });
      res.json({ training });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/unpublish',
  requireRole('SUPER_ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const training = await unpublishTraining(req.params.id);
      await logAudit({
        userId: req.user!.userId,
        action: 'training.unpublished',
        entityType: 'training',
        entityId: training.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });
      res.json({ training });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/validate',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await validateTrainingForPublish(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/publish',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bump = req.body?.version_bump === 'major' ? 'major' : 'minor';
      const training = await publishTraining(req.params.id, req.user!.userId, bump);

      await logAudit({
        userId: req.user!.userId,
        action: 'training.published',
        entityType: 'training',
        entityId: training.id,
        metadata: { version: training.currentVersion },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.json({ training });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Módulos ─────────────────────────────────────────────────

router.get('/:id/modules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const modules = await listModules(req.params.id);
    res.json({ modules });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/modules',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createModuleSchema.parse(req.body);
      const mod = await createModule(req.params.id, data);

      await logAudit({
        userId: req.user!.userId,
        action: 'training.module.added',
        entityType: 'module',
        entityId: mod.id,
        metadata: { trainingId: req.params.id, type: mod.type },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json({ module: mod });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/modules/:moduleId',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateModuleSchema.parse(req.body);
      const mod = await updateModule(req.params.id, req.params.moduleId, data);
      res.json({ module: mod });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id/modules/:moduleId',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteModule(req.params.id, req.params.moduleId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:id/modules/order',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = reorderModulesSchema.parse(req.body);
      const modules = await reorderModules(req.params.id, data.order);
      res.json({ modules });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
