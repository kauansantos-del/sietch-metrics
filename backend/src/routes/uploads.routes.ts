// Upload endpoints — capa de treinamento + vídeo

import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { logAudit } from '../middleware/audit';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  createVideoAsset,
  getPlaybackUrl,
  getVideoAsset,
  uploadCover,
} from '../services/upload.service';
import { BadRequestError } from '../utils/errors';

const router = Router();

router.use(requireAuth);

// Multer com limite de 2GB e memoryStorage (Vercel-friendly)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

// ─── Capa do treinamento (admin) ─────────────────────────────

router.post(
  '/cover',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new BadRequestError('Campo "file" obrigatório (multipart/form-data)');

      const result = await uploadCover({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        size: req.file.size,
      });

      await logAudit({
        userId: req.user!.userId,
        action: 'upload.cover',
        entityType: 'training_cover',
        metadata: { path: result.path, size: req.file.size },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Vídeo upload (admin) ────────────────────────────────────

router.post(
  '/video',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new BadRequestError('Campo "file" obrigatório (multipart/form-data)');

      const result = await createVideoAsset(req.user!.userId, {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        size: req.file.size,
      });

      await logAudit({
        userId: req.user!.userId,
        action: 'upload.video',
        entityType: 'video_asset',
        entityId: result.assetId,
        metadata: { size: req.file.size, filename: req.file.originalname },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Polling de status do asset de vídeo ─────────────────────

router.get('/video/:assetId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const asset = await getVideoAsset(req.params.assetId);
    res.json(asset);
  } catch (err) {
    next(err);
  }
});

// ─── URL assinada de playback ────────────────────────────────

router.get(
  '/video/:assetId/playback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getPlaybackUrl(req.params.assetId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
