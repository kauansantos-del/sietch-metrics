import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { calculateScores } from '../utils/classification';
import type {
  CreateEvaluationInput,
  ListEvaluationsQuery,
  UpdateEvaluationInput,
} from '../schemas/evaluation.schema';

const evaluationInclude = {
  technician: { select: { id: true, name: true, team: true, email: true } },
  evaluator: { select: { id: true, name: true, email: true, picture: true } },
  scores: { orderBy: [{ block: 'asc' as const }, { criterionKey: 'asc' as const }] },
};

export async function createEvaluation(
  evaluatorId: string,
  input: CreateEvaluationInput,
) {
  // Confirma que o técnico existe e está ativo
  const technician = await prisma.technician.findUnique({
    where: { id: input.technicianId },
    select: { id: true, active: true },
  });
  if (!technician) throw new NotFoundError('Técnico não encontrado');
  if (!technician.active) throw new NotFoundError('Técnico está inativo');

  // Cálculo SEMPRE no servidor — cliente não pode forjar finalScore/classification
  const calc = calculateScores(input.scores);

  return prisma.evaluation.create({
    data: {
      technicianId: input.technicianId,
      evaluatorId,
      cycle: input.cycle,
      observations: input.observations,
      recommendation: input.recommendation,
      technicalScore: calc.technicalScore,
      behavioralScore: calc.behavioralScore,
      finalScore: calc.finalScore,
      classification: calc.classification,
      scores: { create: input.scores },
    },
    include: evaluationInclude,
  });
}

export async function listEvaluations(
  user: { userId: string; role: UserRole },
  query: ListEvaluationsQuery,
) {
  const where: Prisma.EvaluationWhereInput = {};

  if (query.technicianId) where.technicianId = query.technicianId;
  if (query.evaluatorId) where.evaluatorId = query.evaluatorId;
  if (query.cycle) where.cycle = query.cycle;
  if (query.classification) where.classification = query.classification;

  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = query.from;
    if (query.to) where.createdAt.lte = query.to;
  }

  // ADMIN só enxerga avaliações que ele mesmo criou
  // SUPER_ADMIN vê todas.
  if (user.role === 'ADMIN') {
    where.evaluatorId = user.userId;
  }

  const [items, total] = await Promise.all([
    prisma.evaluation.findMany({
      where,
      include: {
        technician: { select: { id: true, name: true, team: true } },
        evaluator: { select: { id: true, name: true } },
        scores: { orderBy: [{ block: 'asc' as const }, { criterionKey: 'asc' as const }] },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.evaluation.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getEvaluationById(
  id: string,
  user: { userId: string; role: UserRole },
) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: evaluationInclude,
  });
  if (!evaluation) throw new NotFoundError('Avaliação não encontrada');

  // ADMIN só vê suas próprias
  if (user.role === 'ADMIN' && evaluation.evaluatorId !== user.userId) {
    throw new NotFoundError('Avaliação não encontrada');
  }

  return evaluation;
}

export async function updateEvaluation(
  id: string,
  user: { userId: string; role: UserRole },
  input: UpdateEvaluationInput,
) {
  const existing = await prisma.evaluation.findUnique({
    where: { id },
    select: { id: true, evaluatorId: true },
  });
  if (!existing) throw new NotFoundError('Avaliação não encontrada');

  // Apenas o autor ou um SUPER_ADMIN podem editar
  if (user.role !== 'SUPER_ADMIN' && existing.evaluatorId !== user.userId) {
    throw new ForbiddenError('FORBIDDEN_ROLE', 'Apenas o autor ou um super admin podem editar');
  }

  return prisma.evaluation.update({
    where: { id },
    data: {
      observations: input.observations,
      recommendation: input.recommendation,
    },
    include: evaluationInclude,
  });
}

export async function deleteEvaluation(id: string) {
  // Existência confirmada pelo Prisma — P2025 é tratado no error handler
  await prisma.evaluation.delete({ where: { id } });
}
