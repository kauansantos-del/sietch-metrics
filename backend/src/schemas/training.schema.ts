import { z } from 'zod';

// ─── Enums (mirror do schema.prisma) ─────────────────────────

export const trainingCategoryEnum = z.enum([
  'COMPLIANCE',
  'CYBER_SECURITY',
  'PENTEST',
  'DEV_FRONTEND',
  'DEV_BACKEND',
  'LIDERANCA',
  'SOFT_SKILLS',
  'OUTROS',
]);

export const trainingStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const trainingVisibilityEnum = z.enum(['ALL', 'BY_ROLE', 'BY_TEAM', 'MANUAL']);
export const moduleTypeEnum = z.enum(['VIDEO', 'ARTICLE', 'QUIZ', 'TASK', 'POLICY', 'LIVE']);
export const assignmentStatusEnum = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'OVERDUE',
  'WAITING',
]);

// ─── Payloads por tipo de módulo ─────────────────────────────

const videoPayloadSchema = z.object({
  type: z.literal('video').optional(),
  provider: z.enum(['youtube', 'vimeo', 'upload']),
  source: z.object({
    video_id: z.string().optional(),
    url: z.string().url().optional(),
    unlisted_hash: z.string().optional(),
    asset_id: z.string().uuid().optional(),
    playback_id: z.string().optional(),
    duration_sec: z.number().int().min(0).optional(),
  }),
  captions_url: z.string().url().nullable().optional(),
  transcript_md: z.string().max(50_000).nullable().optional(),
  allow_speed: z.boolean().default(true),
  min_watch_pct: z.number().int().min(50).max(100).default(90),
});

const articlePayloadSchema = z.object({
  type: z.literal('article').optional(),
  content_md: z.string().min(1).max(200_000),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        size_kb: z.number().int().min(0),
      }),
    )
    .max(20)
    .default([]),
  external_link: z.string().url().nullable().optional(),
});

const quizQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['single', 'multiple', 'true_false']),
  statement: z.string().min(1).max(2000),
  options: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        text: z.string().min(1).max(1000),
        correct: z.boolean(),
      }),
    )
    .min(2)
    .max(10),
  explanation: z.string().max(2000).nullable().optional(),
  weight: z.number().int().min(0).default(1),
});

const quizPayloadSchema = z.object({
  type: z.literal('quiz').optional(),
  passing_score: z.number().int().min(0).max(100).default(70),
  max_attempts: z.number().int().min(0).default(3),
  shuffle_questions: z.boolean().default(true),
  show_correct_answers: z.enum(['after_pass', 'always', 'never']).default('after_pass'),
  questions: z.array(quizQuestionSchema).min(3),
});

const taskPayloadSchema = z.object({
  type: z.literal('task').optional(),
  statement_md: z.string().min(1).max(50_000),
  submission_kind: z.enum(['text', 'file', 'link', 'none']),
  acceptance_criteria: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
    .default([]),
  auto_complete: z.boolean().default(false),
  reviewer_role: z.enum(['manager', 'admin', 'none']).default('admin'),
});

const policyPayloadSchema = z.object({
  type: z.literal('policy').optional(),
  policy_ref: z.string().min(1).max(20),
  policy_version: z.string().min(1).max(10),
  effective_date: z.string(), // ISO date
  content_md: z.string().min(1).max(200_000),
  require_full_scroll: z.boolean().default(true),
  accept_label: z.string().min(1).max(500),
});

const livePayloadSchema = z.object({
  type: z.literal('live').optional(),
  scheduled_at: z.string().optional(),
  meeting_url: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});

// ─── Training (Etapa 1 + Etapa 3) ────────────────────────────

export const createTrainingSchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(20).max(500),
  category: trainingCategoryEnum,
  tags: z.array(z.string().trim().min(2).max(30)).max(8).default([]),
  coverUrl: z.string().url().nullable().optional(),
  policyRef: z.string().trim().max(20).nullable().optional(),
  language: z.string().min(2).max(8).default('pt-BR'),
});

export const updateTrainingSchema = z.object({
  title: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().min(20).max(500).optional(),
  category: trainingCategoryEnum.optional(),
  tags: z.array(z.string().trim().min(2).max(30)).max(8).optional(),
  coverUrl: z.string().url().nullable().optional(),
  policyRef: z.string().trim().max(20).nullable().optional(),
  language: z.string().min(2).max(8).optional(),
  // Etapa 3
  isMandatory: z.boolean().optional(),
  deadlineDays: z.number().int().min(1).max(365).nullable().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  maxAttempts: z.number().int().min(0).max(20).optional(),
  visibility: trainingVisibilityEnum.optional(),
  hasCertificate: z.boolean().optional(),
  recurrence: z
    .object({
      kind: z.enum(['never', 'annual', 'every_n_months']),
      interval_months: z.number().int().min(1).max(60).optional(),
    })
    .nullable()
    .optional(),
});

export const listTrainingsQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: trainingStatusEnum.optional(),
  category: trainingCategoryEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Module ──────────────────────────────────────────────────

const modulePayloadByType = z.discriminatedUnion('type', [
  z.object({ type: z.literal('VIDEO'), payload: videoPayloadSchema }),
  z.object({ type: z.literal('ARTICLE'), payload: articlePayloadSchema }),
  z.object({ type: z.literal('QUIZ'), payload: quizPayloadSchema }),
  z.object({ type: z.literal('TASK'), payload: taskPayloadSchema }),
  z.object({ type: z.literal('POLICY'), payload: policyPayloadSchema }),
  z.object({ type: z.literal('LIVE'), payload: livePayloadSchema }),
]);

const baseModuleFields = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  durationMin: z.number().int().min(0).max(600),
  isRequired: z.boolean().default(true),
});

export const createModuleSchema = z.intersection(baseModuleFields, modulePayloadByType);

export const updateModuleSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    durationMin: z.number().int().min(0).max(600).optional(),
    isRequired: z.boolean().optional(),
    payload: z.record(z.unknown()).optional(), // validação detalhada acontece no service por type
  })
  .strict();

export const reorderModulesSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(50),
});

// ─── Assignment ──────────────────────────────────────────────

export const createAssignmentSchema = z.object({
  userId: z.string().uuid(),
  trainingId: z.string().uuid(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const bulkAssignSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  trainingId: z.string().uuid(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const listMyAssignmentsQuerySchema = z.object({
  status: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim().toUpperCase()))
    .pipe(z.array(assignmentStatusEnum))
    .optional(),
  q: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Module progress ─────────────────────────────────────────

export const updateModuleProgressSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']).optional(),
  timeSpentSec: z.number().int().min(0).optional(),
  payload: z.record(z.unknown()).optional(),
});

// ─── Types ───────────────────────────────────────────────────

export type CreateTrainingInput = z.infer<typeof createTrainingSchema>;
export type UpdateTrainingInput = z.infer<typeof updateTrainingSchema>;
export type ListTrainingsQuery = z.infer<typeof listTrainingsQuerySchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type ReorderModulesInput = z.infer<typeof reorderModulesSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
export type ListMyAssignmentsQuery = z.infer<typeof listMyAssignmentsQuerySchema>;
export type UpdateModuleProgressInput = z.infer<typeof updateModuleProgressSchema>;
