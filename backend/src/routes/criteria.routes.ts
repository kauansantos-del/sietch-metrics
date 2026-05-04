import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createCriterionSchema,
  updateCriterionSchema,
} from '../schemas/criterion.schema';
import {
  createCriterion,
  deleteCriterion,
  listCriteria,
  updateCriterion,
} from '../services/criterion.service';

const router = Router();
router.use(requireAuth);

// GET /api/criteria — lista os critérios do usuário autenticado
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await listCriteria(req.user!.userId);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// POST /api/criteria — cria um novo critério
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createCriterionSchema.parse(req.body);
    const item = await createCriterion(req.user!.userId, data);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/criteria/:id — edita um critério (apenas do próprio dono)
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateCriterionSchema.parse(req.body);
    const item = await updateCriterion(req.params.id, req.user!.userId, data);
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/criteria/:id — soft-delete (active=false)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteCriterion(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
