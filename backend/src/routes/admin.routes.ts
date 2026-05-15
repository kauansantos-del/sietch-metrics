// Admin actions, exports e certificados — endpoints administrativos
//
// Spec: task-progressao-colaborador.md §10 (matriz de permissões)
//
// Admin/RH pode resetar tentativas, anular questão, reatribuir treinamento
// e exportar relatórios CSV. Colaborador pode baixar próprio certificado.

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { logAudit } from '../middleware/audit';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  reassignToLatestVersion,
  resetQuizAttempts,
  voidQuizQuestion,
} from '../services/admin-actions.service';
import {
  exportTrainingProgressCSV,
  exportUserAcceptancesCSV,
  exportUserTrainingsCSV,
} from '../services/export.service';
import { buildCertificate } from '../services/certificate.service';
import { ForbiddenError } from '../utils/errors';

const router = Router();

router.use(requireAuth);

// ═══════════════════════════════════════════════════════════
// ADMIN: ações destrutivas/sensíveis
// ═══════════════════════════════════════════════════════════

router.post(
  '/quiz/reset-attempts',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          assignment_id: z.string().uuid(),
          module_id: z.string().uuid(),
        })
        .parse(req.body);

      const result = await resetQuizAttempts(req.user!.userId, body.assignment_id, body.module_id);

      await logAudit({
        userId: req.user!.userId,
        action: 'quiz.attempts.reset',
        entityType: 'module_progress',
        entityId: body.module_id,
        metadata: { assignmentId: body.assignment_id, resetCount: result.resetCount },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/quiz/void-question',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          module_id: z.string().uuid(),
          question_id: z.string().min(1).max(40),
        })
        .parse(req.body);

      const result = await voidQuizQuestion(req.user!.userId, body.module_id, body.question_id);

      await logAudit({
        userId: req.user!.userId,
        action: 'quiz.question.voided',
        entityType: 'module',
        entityId: body.module_id,
        metadata: { questionId: body.question_id, recalculated: result.recalculatedAttempts },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/assignments/reassign',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          user_id: z.string().uuid(),
          training_id: z.string().uuid(),
        })
        .parse(req.body);

      const result = await reassignToLatestVersion(
        req.user!.userId,
        body.user_id,
        body.training_id,
      );

      await logAudit({
        userId: req.user!.userId,
        action: 'assignment.reassigned',
        entityType: 'assignment',
        entityId: result.assignment.id,
        metadata: { userId: body.user_id, trainingId: body.training_id, created: result.created },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(result.created ? 201 : 200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ═══════════════════════════════════════════════════════════
// EXPORTS CSV (compliance)
// ═══════════════════════════════════════════════════════════

function sendCsv(res: Response, filename: string, csv: string) {
  // BOM + UTF-8 — Excel pt-BR abre corretamente acentos
  const withBom = '﻿' + csv;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(withBom);
}

router.get(
  '/exports/users/:userId/trainings.csv',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, userId } = req.user!;
      const targetUserId = req.params.userId === 'me' ? userId : req.params.userId;
      const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
      if (!isAdmin && userId !== targetUserId) {
        throw new ForbiddenError('FORBIDDEN_ROLE', 'Sem permissão');
      }

      const csv = await exportUserTrainingsCSV(targetUserId);
      sendCsv(res, `treinamentos-${targetUserId}.csv`, csv);

      await logAudit({
        userId,
        action: 'export.user_trainings.csv',
        entityType: 'user',
        entityId: targetUserId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/exports/users/:userId/acceptances.csv',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, userId } = req.user!;
      const targetUserId = req.params.userId === 'me' ? userId : req.params.userId;
      const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
      if (!isAdmin && userId !== targetUserId) {
        throw new ForbiddenError('FORBIDDEN_ROLE', 'Sem permissão');
      }

      const csv = await exportUserAcceptancesCSV(targetUserId);
      sendCsv(res, `aceites-${targetUserId}.csv`, csv);

      await logAudit({
        userId,
        action: 'export.user_acceptances.csv',
        entityType: 'user',
        entityId: targetUserId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/exports/trainings/:trainingId/progress.csv',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const csv = await exportTrainingProgressCSV(req.params.trainingId);
      sendCsv(res, `progresso-${req.params.trainingId}.csv`, csv);

      await logAudit({
        userId: req.user!.userId,
        action: 'export.training_progress.csv',
        entityType: 'training',
        entityId: req.params.trainingId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ═══════════════════════════════════════════════════════════
// CERTIFICADO
// ═══════════════════════════════════════════════════════════

router.get(
  '/certificate/:assignmentId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.user!;
      const { html, data } = await buildCertificate(userId, req.params.assignmentId);

      await logAudit({
        userId,
        action: 'certificate.generated',
        entityType: 'assignment',
        entityId: req.params.assignmentId,
        metadata: { hash: data.hash },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      const accept = req.headers.accept ?? '';
      if (accept.includes('application/json')) {
        res.json({ data });
      } else {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      }
    } catch (err) {
      next(err);
    }
  },
);

export default router;
