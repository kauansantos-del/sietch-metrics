import { z } from 'zod';

const cycleRegex = /^\d{4}-Q[1-4]$/;

const scoreItemSchema = z.object({
  block: z.enum(['TECNICO', 'COMPORTAMENTAL']),
  criterionKey: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'criterionKey deve conter apenas a-z, 0-9 e underscore'),
  score: z.number().int().min(1).max(5),
  weight: z.number().int().min(1).max(3),
});

export const recommendationSchema = z.enum([
  'ELEGIVEL_BONUS',
  'INDICADO_PROMOCAO',
  'PLANO_DESENVOLVIMENTO',
  'ATENCAO_URGENTE',
]);

export const createEvaluationSchema = z.object({
  technicianId: z.string().uuid(),
  cycle: z.string().regex(cycleRegex, 'cycle deve estar no formato YYYY-Q1..Q4'),
  scores: z
    .array(scoreItemSchema)
    .length(10, 'A avaliação precisa conter exatamente 10 critérios'),
  observations: z.string().max(5000).optional(),
  recommendation: recommendationSchema.optional(),
}).superRefine((data, ctx) => {
  // Garantir 5 técnicos + 5 comportamentais (não confiar só no length total)
  const tec = data.scores.filter((s) => s.block === 'TECNICO').length;
  const comp = data.scores.filter((s) => s.block === 'COMPORTAMENTAL').length;
  if (tec !== 5 || comp !== 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Cada bloco deve conter exatamente 5 critérios (TECNICO=5, COMPORTAMENTAL=5)',
      path: ['scores'],
    });
  }

  // Garantir que critérios não se repetem dentro da mesma avaliação
  const seen = new Set<string>();
  for (const s of data.scores) {
    const key = `${s.block}:${s.criterionKey}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Critério duplicado: ${key}`,
        path: ['scores'],
      });
      return;
    }
    seen.add(key);
  }
});

export const updateEvaluationSchema = z.object({
  observations: z.string().max(5000).optional(),
  recommendation: recommendationSchema.nullable().optional(),
});

export const listEvaluationsQuerySchema = z.object({
  technicianId: z.string().uuid().optional(),
  evaluatorId: z.string().uuid().optional(),
  cycle: z.string().regex(cycleRegex).optional(),
  classification: z.enum(['OTIMO', 'BOM', 'REGULAR', 'CRITICO']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;
export type UpdateEvaluationInput = z.infer<typeof updateEvaluationSchema>;
export type ListEvaluationsQuery = z.infer<typeof listEvaluationsQuerySchema>;
