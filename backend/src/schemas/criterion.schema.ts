import { z } from 'zod';

export const criterionBlockSchema = z.enum(['TECNICO', 'COMPORTAMENTAL']);

export const createCriterionSchema = z.object({
  block: criterionBlockSchema,
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional().nullable(),
  weight: z.number().int().min(1).max(3),
  position: z.number().int().min(0).max(999).optional(),
});

export const updateCriterionSchema = z.object({
  block: criterionBlockSchema.optional(),
  label: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(400).optional().nullable(),
  weight: z.number().int().min(1).max(3).optional(),
  position: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

export type CreateCriterionInput = z.infer<typeof createCriterionSchema>;
export type UpdateCriterionInput = z.infer<typeof updateCriterionSchema>;
