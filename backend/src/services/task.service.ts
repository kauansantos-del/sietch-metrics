import { Prisma, TaskSubmissionKind, TaskSubmissionStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { completeModule } from './module-progress.service';
import { recalculateAssignmentProgress } from './assignment.service';

interface TaskPayload {
  statement_md: string;
  submission_kind: 'text' | 'file' | 'link' | 'none';
  acceptance_criteria?: Array<{ id: string; text: string }>;
  auto_complete?: boolean;
  reviewer_role?: 'manager' | 'admin' | 'none';
}

const KIND_MAP: Record<string, TaskSubmissionKind> = {
  text: TaskSubmissionKind.TEXT,
  file: TaskSubmissionKind.FILE,
  link: TaskSubmissionKind.LINK,
  none: TaskSubmissionKind.NONE,
};

async function loadTaskContext(userId: string, assignmentId: string, moduleId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    select: { id: true, trainingId: true },
  });
  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  const mod = await prisma.module.findFirst({
    where: { id: moduleId, trainingId: assignment.trainingId },
  });
  if (!mod) throw new NotFoundError('Módulo não pertence a esta atribuição');
  if (mod.type !== 'TASK') throw new BadRequestError('Módulo não é do tipo task');

  const payload = mod.payload as unknown as TaskPayload;

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

// ─── Submeter tarefa ─────────────────────────────────────────

export interface SubmitTaskInput {
  kind: 'text' | 'file' | 'link' | 'none';
  content: { text?: string; file_url?: string; filename?: string; url?: string };
}

export async function submitTask(
  userId: string,
  assignmentId: string,
  moduleId: string,
  input: SubmitTaskInput,
) {
  const ctx = await loadTaskContext(userId, assignmentId, moduleId);

  if (ctx.payload.submission_kind !== input.kind) {
    throw new BadRequestError(
      `Tipo de submissão "${input.kind}" não bate com o módulo (esperado: ${ctx.payload.submission_kind})`,
    );
  }

  // Validação básica do conteúdo
  if (input.kind === 'text' && !input.content.text?.trim()) {
    throw new BadRequestError('Texto da submissão é obrigatório');
  }
  if (input.kind === 'link' && !input.content.url) {
    throw new BadRequestError('URL da submissão é obrigatória');
  }
  if (input.kind === 'file' && !input.content.file_url) {
    throw new BadRequestError('Arquivo da submissão é obrigatório');
  }

  // Próximo número de submissão
  const last = await prisma.taskSubmission.findFirst({
    where: { moduleProgressId: ctx.progress.id },
    orderBy: { submissionNumber: 'desc' },
    select: { submissionNumber: true, status: true },
  });

  // Bloqueia nova submissão se a última está pending (sem revisão)
  if (last && last.status === TaskSubmissionStatus.PENDING) {
    throw new ConflictError('Já existe uma submissão aguardando revisão');
  }

  // Bloqueia se já foi aprovada
  if (
    last &&
    (last.status === TaskSubmissionStatus.APPROVED ||
      last.status === TaskSubmissionStatus.APPROVED_WITH_NOTES)
  ) {
    throw new ConflictError('Tarefa já foi aprovada');
  }

  const submissionNumber = (last?.submissionNumber ?? 0) + 1;
  const autoComplete = ctx.payload.auto_complete === true || ctx.payload.reviewer_role === 'none';

  const submission = await prisma.taskSubmission.create({
    data: {
      moduleProgressId: ctx.progress.id,
      submissionNumber,
      submissionKind: KIND_MAP[input.kind] ?? TaskSubmissionKind.TEXT,
      content: input.content as Prisma.InputJsonValue,
      status: autoComplete ? TaskSubmissionStatus.APPROVED : TaskSubmissionStatus.PENDING,
      reviewedAt: autoComplete ? new Date() : null,
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      type: 'task.submitted',
      moduleId,
      payload: {
        submissionId: submission.id,
        submissionNumber,
        kind: input.kind,
      } as Prisma.InputJsonValue,
    },
  });

  if (autoComplete) {
    await completeModule(userId, assignmentId, moduleId);
  } else {
    await recalculateAssignmentProgress(assignmentId);
  }

  return submission;
}

// ─── Revisar tarefa (admin/manager) ──────────────────────────

export interface ReviewTaskInput {
  decision: 'APPROVED' | 'REJECTED' | 'APPROVED_WITH_NOTES';
  feedback?: string;
  criteriaChecks?: Array<{ id: string; text: string; checked: boolean }>;
}

export async function reviewSubmission(
  reviewerId: string,
  submissionId: string,
  input: ReviewTaskInput,
) {
  const submission = await prisma.taskSubmission.findUnique({
    where: { id: submissionId },
    include: {
      moduleProgress: {
        include: {
          assignment: { select: { userId: true, id: true } },
          module: { select: { id: true } },
        },
      },
    },
  });
  if (!submission) throw new NotFoundError('Submissão não encontrada');

  if (submission.status !== TaskSubmissionStatus.PENDING) {
    throw new ConflictError('Submissão já foi revisada');
  }

  const status = TaskSubmissionStatus[input.decision];

  const updated = await prisma.taskSubmission.update({
    where: { id: submissionId },
    data: {
      status,
      reviewerId,
      reviewedAt: new Date(),
      feedback: input.feedback ?? null,
      criteriaChecks: input.criteriaChecks
        ? (input.criteriaChecks as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId: submission.moduleProgress.assignment.userId,
      type: 'task.reviewed',
      moduleId: submission.moduleProgress.module.id,
      payload: {
        submissionId,
        decision: input.decision,
        reviewerId,
      } as Prisma.InputJsonValue,
    },
  });

  const approved =
    status === TaskSubmissionStatus.APPROVED ||
    status === TaskSubmissionStatus.APPROVED_WITH_NOTES;

  if (approved) {
    await completeModule(
      submission.moduleProgress.assignment.userId,
      submission.moduleProgress.assignment.id,
      submission.moduleProgress.module.id,
    );
  } else {
    await recalculateAssignmentProgress(submission.moduleProgress.assignment.id);
  }

  return updated;
}

// ─── Listagens ───────────────────────────────────────────────

export async function listSubmissions(userId: string, assignmentId: string, moduleId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    select: { id: true },
  });
  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  const progress = await prisma.moduleProgress.findUnique({
    where: { assignmentId_moduleId: { assignmentId, moduleId } },
  });
  if (!progress) return { submissions: [] };

  const submissions = await prisma.taskSubmission.findMany({
    where: { moduleProgressId: progress.id },
    orderBy: { submissionNumber: 'desc' },
    include: {
      reviewer: { select: { id: true, name: true } },
    },
  });

  return { submissions };
}

export async function listPendingReviews(reviewerRole: string) {
  // Admins veem todas as pendentes
  if (reviewerRole !== 'SUPER_ADMIN' && reviewerRole !== 'ADMIN') {
    return { submissions: [] };
  }

  const submissions = await prisma.taskSubmission.findMany({
    where: { status: TaskSubmissionStatus.PENDING },
    orderBy: { submittedAt: 'asc' },
    include: {
      moduleProgress: {
        include: {
          assignment: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              training: { select: { id: true, title: true } },
            },
          },
          module: { select: { id: true, title: true } },
        },
      },
    },
  });

  return { submissions };
}
