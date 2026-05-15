// Rotas do player do colaborador — quiz, task, policy, video
// Todas montadas sob /api/player

import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { logAudit } from '../middleware/audit';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  getAttemptDetail,
  listAttempts,
  startAttempt,
  submitAttempt,
} from '../services/quiz.service';
import {
  listPendingReviews,
  listSubmissions,
  reviewSubmission,
  submitTask,
} from '../services/task.service';
import {
  acceptPolicy,
  getAcceptanceSnapshot,
  listAcceptances,
} from '../services/policy.service';
import {
  getProgress as getVideoProgress,
  reportProgress as reportVideoProgress,
  resolveVideoInput,
} from '../services/video.service';

const router = Router();

router.use(requireAuth);

// ═══════════════════════════════════════════════════════════
// QUIZ
// ═══════════════════════════════════════════════════════════

router.post(
  '/quiz/:assignmentId/:moduleId/start',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attempt = await startAttempt(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
      );
      // Não devolve `correct` das opções para não vazar gabarito no client.
      const payload = attempt.payload as Record<string, unknown>;
      const questions = (payload.questions ?? []) as Array<{
        id: string;
        kind: string;
        statement: string;
        options: Array<{ id: string; text: string }>;
      }>;

      res.json({
        attempt: {
          id: attempt.id,
          attempt_number: attempt.attemptNumber,
          started_at: attempt.startedAt,
        },
        questions: questions.map((q) => ({
          id: q.id,
          kind: q.kind,
          statement: q.statement,
          options: q.options.map((o) => ({ id: o.id, text: o.text })),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

const submitAttemptSchema = z.object({
  attempt_id: z.string().uuid(),
  answers: z
    .array(
      z.object({
        question_id: z.string().min(1).max(40),
        selected_options: z.array(z.string()).default([]),
        time_spent_sec: z.number().int().min(0).max(7200).optional(),
      }),
    )
    .min(1)
    .max(100),
});

router.post(
  '/quiz/:assignmentId/:moduleId/submit',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = submitAttemptSchema.parse(req.body);
      const result = await submitAttempt(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
        data.attempt_id,
        data.answers,
      );

      await logAudit({
        userId: req.user!.userId,
        action: 'quiz.attempt.submitted',
        entityType: 'quiz_attempt',
        entityId: result.attemptId,
        metadata: { scorePct: result.scorePct, passed: result.passed },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/quiz/:assignmentId/:moduleId/attempts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await listAttempts(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/quiz/attempts/:attemptId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
    const detail = await getAttemptDetail(req.user!.userId, req.params.attemptId, isAdmin);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════
// TASK
// ═══════════════════════════════════════════════════════════

const submitTaskSchema = z.object({
  kind: z.enum(['text', 'file', 'link', 'none']),
  content: z.object({
    text: z.string().max(50_000).optional(),
    file_url: z.string().url().optional(),
    filename: z.string().max(255).optional(),
    url: z.string().url().optional(),
  }),
});

router.post(
  '/task/:assignmentId/:moduleId/submit',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = submitTaskSchema.parse(req.body);
      const submission = await submitTask(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
        data,
      );
      res.status(201).json({ submission });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/task/:assignmentId/:moduleId/submissions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await listSubmissions(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'APPROVED_WITH_NOTES']),
  feedback: z.string().max(5000).optional(),
  criteriaChecks: z
    .array(z.object({ id: z.string(), text: z.string(), checked: z.boolean() }))
    .max(30)
    .optional(),
});

router.post(
  '/task/submissions/:submissionId/review',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = reviewSchema.parse(req.body);
      const submission = await reviewSubmission(req.user!.userId, req.params.submissionId, data);

      await logAudit({
        userId: req.user!.userId,
        action: 'task.reviewed',
        entityType: 'task_submission',
        entityId: req.params.submissionId,
        metadata: { decision: data.decision },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.json({ submission });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/task/pending-reviews',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await listPendingReviews(req.user!.role);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ═══════════════════════════════════════════════════════════
// POLICY
// ═══════════════════════════════════════════════════════════

const acceptPolicySchema = z.object({
  reading_time_sec: z.number().int().min(0).max(7200).optional(),
});

router.post(
  '/policy/:assignmentId/:moduleId/accept',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = acceptPolicySchema.parse(req.body);
      const acceptance = await acceptPolicy(
        req.user!.userId,
        req.params.assignmentId,
        req.params.moduleId,
        {
          readingTimeSec: data.reading_time_sec,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      );

      await logAudit({
        userId: req.user!.userId,
        action: 'policy.accepted',
        entityType: 'policy_acceptance',
        entityId: acceptance.id,
        metadata: {
          policyRef: acceptance.policyRef,
          policyVersion: acceptance.policyVersion,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json({ acceptance });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/policy/acceptances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await listAcceptances(req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/policy/acceptances/:id/snapshot',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
      const snapshot = await getAcceptanceSnapshot(req.user!.userId, req.params.id, isAdmin);
      res.json({ snapshot });
    } catch (err) {
      next(err);
    }
  },
);

// ═══════════════════════════════════════════════════════════
// VIDEO
// ═══════════════════════════════════════════════════════════

const videoProgressSchema = z.object({
  event: z.enum(['play', 'pause', 'seek', 'tick', 'ended', 'error']),
  current_time_sec: z.number().min(0).max(60_000),
  duration_sec: z.number().min(0).max(60_000),
  session_id: z.string().max(64).optional(),
  interval_covered: z.tuple([z.number().min(0), z.number().min(0)]).optional(),
});

router.post(
  '/video/:moduleId/progress',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = videoProgressSchema.parse(req.body);
      const result = await reportVideoProgress(req.user!.userId, req.params.moduleId, {
        event: data.event,
        currentTimeSec: data.current_time_sec,
        durationSec: data.duration_sec,
        sessionId: data.session_id,
        intervalCovered: data.interval_covered,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/video/:moduleId/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getVideoProgress(req.user!.userId, req.params.moduleId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const resolveVideoSchema = z.object({
  provider: z.enum(['youtube', 'vimeo']),
  input: z.string().min(1).max(500),
});

router.post(
  '/video/resolve',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = resolveVideoSchema.parse(req.body);
      const result = await resolveVideoInput(data.provider, data.input);
      const status = result.valid ? 200 : 422;
      res.status(status).json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
