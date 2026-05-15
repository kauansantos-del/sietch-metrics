import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { recalculateAssignmentProgress } from './assignment.service';
import { completeModule } from './module-progress.service';

interface QuizQuestion {
  id: string;
  kind: 'single' | 'multiple' | 'true_false';
  statement: string;
  options: Array<{ id: string; text: string; correct: boolean }>;
  explanation?: string | null;
  weight?: number;
}

interface QuizPayload {
  passing_score: number;
  max_attempts: number;
  shuffle_questions?: boolean;
  show_correct_answers?: 'after_pass' | 'always' | 'never';
  questions: QuizQuestion[];
}

async function loadQuizContext(userId: string, assignmentId: string, moduleId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    select: { id: true, trainingId: true },
  });
  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  const mod = await prisma.module.findFirst({
    where: { id: moduleId, trainingId: assignment.trainingId },
  });
  if (!mod) throw new NotFoundError('Módulo não pertence a esta atribuição');
  if (mod.type !== 'QUIZ') throw new BadRequestError('Módulo não é do tipo quiz');

  const payload = mod.payload as unknown as QuizPayload;
  if (!payload?.questions?.length) {
    throw new BadRequestError('Quiz sem questões configuradas');
  }

  // Garante ModuleProgress
  let progress = await prisma.moduleProgress.findUnique({
    where: { assignmentId_moduleId: { assignmentId, moduleId } },
  });
  if (!progress) {
    progress = await prisma.moduleProgress.create({
      data: {
        assignmentId,
        moduleId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  return { assignment, module: mod, payload, progress };
}

// ─── Iniciar tentativa ───────────────────────────────────────

export async function startAttempt(userId: string, assignmentId: string, moduleId: string) {
  const ctx = await loadQuizContext(userId, assignmentId, moduleId);

  const attempts = await prisma.quizAttempt.findMany({
    where: { moduleProgressId: ctx.progress.id },
    orderBy: { attemptNumber: 'desc' },
    take: 1,
  });

  // Bloqueio se já passou no limite
  const used = await prisma.quizAttempt.count({
    where: {
      moduleProgressId: ctx.progress.id,
      submittedAt: { not: null },
    },
  });
  if (ctx.payload.max_attempts > 0 && used >= ctx.payload.max_attempts) {
    throw new ConflictError('Limite de tentativas atingido');
  }

  // Bloqueio se há uma tentativa aberta (sem submitted_at)
  const open = attempts.find((a) => a.submittedAt === null);
  if (open) return open;

  const nextNumber = (attempts[0]?.attemptNumber ?? 0) + 1;

  const attempt = await prisma.quizAttempt.create({
    data: {
      moduleProgressId: ctx.progress.id,
      attemptNumber: nextNumber,
      payload: { questions: ctx.payload.questions } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      type: 'quiz.attempt.started',
      moduleId,
      payload: { attemptId: attempt.id, attemptNumber: nextNumber } as Prisma.InputJsonValue,
    },
  });

  return attempt;
}

// ─── Calcular nota ───────────────────────────────────────────

function scoreAttempt(
  questions: QuizQuestion[],
  answers: Array<{ question_id: string; selected_options: string[] }>,
) {
  let totalWeight = 0;
  let earned = 0;

  const perQuestion: Array<{
    questionId: string;
    selectedOptions: string[];
    correct: boolean;
    partialCredit: number;
  }> = [];

  for (const q of questions) {
    const weight = q.weight ?? 1;
    totalWeight += weight;

    const answer = answers.find((a) => a.question_id === q.id);
    const selected = answer?.selected_options ?? [];

    const correctIds = q.options.filter((o) => o.correct).map((o) => o.id);
    const incorrectSelected = selected.filter((id) => !correctIds.includes(id));

    let credit = 0;
    let isCorrect = false;

    if (q.kind === 'single' || q.kind === 'true_false') {
      isCorrect = selected.length === 1 && correctIds.includes(selected[0]!);
      credit = isCorrect ? 1 : 0;
    } else if (q.kind === 'multiple') {
      const correctSelected = selected.filter((id) => correctIds.includes(id)).length;
      const totalCorrect = correctIds.length || 1;
      if (incorrectSelected.length > 0) {
        credit = 0; // marcou errada anula
      } else {
        credit = correctSelected / totalCorrect;
      }
      isCorrect = credit === 1;
    }

    earned += credit * weight;
    perQuestion.push({
      questionId: q.id,
      selectedOptions: selected,
      correct: isCorrect,
      partialCredit: Number(credit.toFixed(4)),
    });
  }

  const scorePct = totalWeight > 0 ? (earned / totalWeight) * 100 : 0;
  return { scorePct: Number(scorePct.toFixed(2)), perQuestion };
}

// ─── Submeter tentativa ──────────────────────────────────────

export async function submitAttempt(
  userId: string,
  assignmentId: string,
  moduleId: string,
  attemptId: string,
  answers: Array<{ question_id: string; selected_options: string[]; time_spent_sec?: number }>,
) {
  const ctx = await loadQuizContext(userId, assignmentId, moduleId);

  const attempt = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, moduleProgressId: ctx.progress.id },
  });
  if (!attempt) throw new NotFoundError('Tentativa não encontrada');
  if (attempt.submittedAt !== null) {
    throw new ConflictError('Tentativa já foi submetida');
  }

  const questions = (attempt.payload as unknown as { questions: QuizQuestion[] }).questions;
  const { scorePct, perQuestion } = scoreAttempt(questions, answers);
  const passed = scorePct >= ctx.payload.passing_score;
  const submittedAt = new Date();
  const durationSec = Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000);

  await prisma.$transaction([
    prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        submittedAt,
        durationSec,
        scorePct: new Prisma.Decimal(scorePct),
        passed,
      },
    }),
    prisma.quizAnswer.deleteMany({ where: { attemptId } }),
    prisma.quizAnswer.createMany({
      data: perQuestion.map((p) => ({
        attemptId,
        questionId: p.questionId,
        selectedOptions: p.selectedOptions,
        correct: p.correct,
        partialCredit: new Prisma.Decimal(p.partialCredit * 100),
        timeSpentSec: answers.find((a) => a.question_id === p.questionId)?.time_spent_sec ?? null,
      })),
    }),
  ]);

  await prisma.activityEvent.create({
    data: {
      userId,
      type: 'quiz.attempt.submitted',
      moduleId,
      payload: {
        attemptId,
        attemptNumber: attempt.attemptNumber,
        scorePct,
        passed,
      } as Prisma.InputJsonValue,
    },
  });

  // Se passou, completa o módulo
  if (passed) {
    await completeModule(userId, assignmentId, moduleId);
  } else {
    await recalculateAssignmentProgress(assignmentId);
  }

  return {
    attemptId,
    scorePct,
    passed,
    durationSec,
    perQuestion,
  };
}

// ─── Listagem ────────────────────────────────────────────────

export async function listAttempts(userId: string, assignmentId: string, moduleId: string) {
  // Garante que o user é dono do assignment
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    select: { id: true, trainingId: true },
  });
  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  const progress = await prisma.moduleProgress.findUnique({
    where: { assignmentId_moduleId: { assignmentId, moduleId } },
  });
  if (!progress) return { attempts: [] };

  const attempts = await prisma.quizAttempt.findMany({
    where: { moduleProgressId: progress.id },
    orderBy: { attemptNumber: 'desc' },
    select: {
      id: true,
      attemptNumber: true,
      startedAt: true,
      submittedAt: true,
      durationSec: true,
      scorePct: true,
      passed: true,
    },
  });

  return { attempts };
}

export async function getAttemptDetail(viewerId: string, attemptId: string, isAdmin: boolean) {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      moduleProgress: {
        include: {
          assignment: { select: { userId: true } },
          module: true,
        },
      },
      answers: true,
    },
  });
  if (!attempt) throw new NotFoundError('Tentativa não encontrada');

  // Auth: só admin ou dono pode ver detalhe
  if (!isAdmin && attempt.moduleProgress.assignment.userId !== viewerId) {
    throw new NotFoundError('Tentativa não encontrada');
  }

  const questions = (attempt.payload as unknown as { questions: QuizQuestion[] }).questions;

  const enriched = questions.map((q) => {
    const ans = attempt.answers.find((a) => a.questionId === q.id);
    return {
      question_id: q.id,
      statement: q.statement,
      kind: q.kind,
      weight: q.weight ?? 1,
      explanation: q.explanation ?? null,
      time_spent_sec: ans?.timeSpentSec ?? null,
      correct: ans?.correct ?? false,
      partial_credit: ans?.partialCredit ? Number(ans.partialCredit) : 0,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        correct: o.correct,
        selected: ans?.selectedOptions.includes(o.id) ?? false,
      })),
    };
  });

  return {
    attempt: {
      id: attempt.id,
      attempt_number: attempt.attemptNumber,
      started_at: attempt.startedAt,
      submitted_at: attempt.submittedAt,
      duration_sec: attempt.durationSec,
      score_pct: attempt.scorePct ? Number(attempt.scorePct) : null,
      passed: attempt.passed,
    },
    answers: enriched,
  };
}
