// Admin actions — operações destrutivas/sensíveis que admin/RH pode fazer
// Spec: task-progressao-colaborador.md §10 (Permissões) + §14 (Edge cases)

import { Prisma, TrainingStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { recalculateAssignmentProgress } from './assignment.service';

interface QuizQuestion {
  id: string;
  kind: 'single' | 'multiple' | 'true_false';
  weight?: number;
  options: Array<{ id: string; correct: boolean }>;
}

// ─── Resetar tentativas de quiz ──────────────────────────────
// Apaga todas as tentativas + answers de um módulo, devolve oportunidade ao colaborador

export async function resetQuizAttempts(
  adminId: string,
  assignmentId: string,
  moduleId: string,
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { userId: true, trainingId: true },
  });
  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  const mod = await prisma.module.findFirst({
    where: { id: moduleId, trainingId: assignment.trainingId },
    select: { id: true, type: true },
  });
  if (!mod) throw new NotFoundError('Módulo não encontrado');
  if (mod.type !== 'QUIZ') throw new BadRequestError('Módulo não é quiz');

  const progress = await prisma.moduleProgress.findUnique({
    where: { assignmentId_moduleId: { assignmentId, moduleId } },
  });
  if (!progress) {
    return { resetCount: 0 };
  }

  // Deleta todas as tentativas (answers cascateiam)
  const result = await prisma.quizAttempt.deleteMany({
    where: { moduleProgressId: progress.id },
  });

  // Volta módulo para NOT_STARTED
  await prisma.moduleProgress.update({
    where: { id: progress.id },
    data: { status: 'NOT_STARTED', startedAt: null, completedAt: null },
  });

  await prisma.activityEvent.create({
    data: {
      userId: assignment.userId,
      type: 'quiz.attempts.reset',
      moduleId,
      payload: { resetBy: adminId, resetCount: result.count } as Prisma.InputJsonValue,
    },
  });

  await recalculateAssignmentProgress(assignmentId);
  return { resetCount: result.count };
}

// ─── Anular questão de quiz ──────────────────────────────────
// Marca a questão com peso 0 nas tentativas existentes e recalcula nota.
// Aplica retroativo a todas as tentativas do módulo (todos os alunos).

export async function voidQuizQuestion(
  adminId: string,
  moduleId: string,
  questionId: string,
) {
  const mod = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!mod) throw new NotFoundError('Módulo não encontrado');
  if (mod.type !== 'QUIZ') throw new BadRequestError('Módulo não é quiz');

  const payload = mod.payload as unknown as { questions: QuizQuestion[] };
  const targetQ = payload.questions.find((q) => q.id === questionId);
  if (!targetQ) throw new NotFoundError('Questão não encontrada no módulo');

  // Atualiza payload do módulo (peso 0 = não pontua)
  const newQuestions = payload.questions.map((q) =>
    q.id === questionId ? { ...q, weight: 0 } : q,
  );

  await prisma.module.update({
    where: { id: moduleId },
    data: {
      payload: ({ ...payload, questions: newQuestions } as unknown) as Prisma.InputJsonValue,
    },
  });

  // Busca todas as tentativas que envolveram este módulo
  const attempts = await prisma.quizAttempt.findMany({
    where: {
      moduleProgress: { moduleId },
      submittedAt: { not: null },
    },
    include: { answers: true },
  });

  let recalculated = 0;
  const passingScore = (payload as { passing_score?: number }).passing_score ?? 70;

  for (const attempt of attempts) {
    const attemptQuestions = (attempt.payload as unknown as { questions: QuizQuestion[] }).questions;

    // Recalcula nota ignorando a questão anulada
    let totalWeight = 0;
    let earned = 0;

    for (const q of attemptQuestions) {
      const weight = q.id === questionId ? 0 : q.weight ?? 1;
      totalWeight += weight;

      if (weight === 0) continue;

      const ans = attempt.answers.find((a) => a.questionId === q.id);
      if (!ans) continue;

      const credit = Number(ans.partialCredit ?? 0) / 100;
      earned += credit * weight;
    }

    const newScore = totalWeight > 0 ? (earned / totalWeight) * 100 : 0;
    const newPassed = newScore >= passingScore;

    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        scorePct: new Prisma.Decimal(newScore.toFixed(2)),
        passed: newPassed,
      },
    });

    recalculated++;
  }

  await prisma.activityEvent.create({
    data: {
      userId: adminId,
      type: 'quiz.question.voided',
      moduleId,
      payload: {
        questionId,
        statement: targetQ.id,
        recalculatedAttempts: recalculated,
      } as Prisma.InputJsonValue,
    },
  });

  return { recalculatedAttempts: recalculated };
}

// ─── Reatribuir treinamento (nova versão para o colaborador) ─

export async function reassignToLatestVersion(
  adminId: string,
  userId: string,
  trainingId: string,
) {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: {
      versions: { orderBy: { publishedAt: 'desc' }, take: 1 },
    },
  });
  if (!training) throw new NotFoundError('Treinamento não encontrado');
  if (training.status !== TrainingStatus.PUBLISHED) {
    throw new ConflictError('Treinamento não está publicado');
  }

  const latest = training.versions[0];
  if (!latest) throw new ConflictError('Treinamento sem versão publicada');

  // Atribuição existente nessa versão?
  const existingInLatest = await prisma.assignment.findUnique({
    where: {
      userId_trainingId_trainingVersionId: {
        userId,
        trainingId,
        trainingVersionId: latest.id,
      },
    },
  });
  if (existingInLatest) {
    return { assignment: existingInLatest, created: false };
  }

  const dueAt =
    training.deadlineDays != null
      ? new Date(Date.now() + training.deadlineDays * 24 * 60 * 60 * 1000)
      : null;

  const assignment = await prisma.assignment.create({
    data: {
      userId,
      trainingId,
      trainingVersionId: latest.id,
      assignedBy: adminId,
      dueAt,
      status: 'NOT_STARTED',
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      type: 'training.reassigned',
      trainingId,
      payload: {
        assignmentId: assignment.id,
        toVersion: latest.version,
        reassignedBy: adminId,
      } as Prisma.InputJsonValue,
    },
  });

  return { assignment, created: true };
}
