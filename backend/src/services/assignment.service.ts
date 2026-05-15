import {
  AssignmentStatus,
  ModuleProgressStatus,
  Prisma,
  TrainingStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import type {
  BulkAssignInput,
  CreateAssignmentInput,
  ListMyAssignmentsQuery,
} from '../schemas/training.schema';

interface CreateAssignmentArgs {
  trainingId: string;
  userId: string;
  assignedBy: string;
  dueAt?: Date | null;
}

async function createOneAssignment({
  trainingId,
  userId,
  assignedBy,
  dueAt,
}: CreateAssignmentArgs) {
  // Buscar a versão atual publicada
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: {
      versions: { orderBy: { publishedAt: 'desc' }, take: 1 },
    },
  });

  if (!training) throw new NotFoundError('Treinamento não encontrado');
  if (training.status !== TrainingStatus.PUBLISHED) {
    throw new ConflictError('Só é possível atribuir treinamentos publicados');
  }

  const latestVersion = training.versions[0];
  if (!latestVersion) {
    throw new ConflictError('Treinamento sem versão publicada');
  }

  // Verifica usuário
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, active: true },
  });
  if (!user) throw new NotFoundError(`Usuário ${userId} não encontrado`);
  if (!user.active) {
    throw new ConflictError(`Usuário ${userId} está inativo`);
  }

  // Verifica duplicata para esta versão
  const existing = await prisma.assignment.findUnique({
    where: {
      userId_trainingId_trainingVersionId: {
        userId,
        trainingId,
        trainingVersionId: latestVersion.id,
      },
    },
  });
  if (existing) {
    return existing; // idempotente — não duplica
  }

  // Calcular dueAt automaticamente se não passado e treinamento tem deadlineDays
  const computedDueAt =
    dueAt ??
    (training.deadlineDays
      ? new Date(Date.now() + training.deadlineDays * 24 * 60 * 60 * 1000)
      : null);

  const assignment = await prisma.assignment.create({
    data: {
      userId,
      trainingId,
      trainingVersionId: latestVersion.id,
      assignedBy,
      dueAt: computedDueAt,
      status: AssignmentStatus.NOT_STARTED,
    },
  });

  // Evento de atividade
  await prisma.activityEvent.create({
    data: {
      userId,
      type: 'assignment.created',
      trainingId,
      payload: { assignmentId: assignment.id, assignedBy } as Prisma.InputJsonValue,
    },
  });

  return assignment;
}

export async function createAssignment(input: CreateAssignmentInput, assignedBy: string) {
  return createOneAssignment({
    trainingId: input.trainingId,
    userId: input.userId,
    assignedBy,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
  });
}

export async function bulkAssign(input: BulkAssignInput, assignedBy: string) {
  const results: { userId: string; assignmentId?: string; error?: string }[] = [];

  for (const userId of input.userIds) {
    try {
      const assignment = await createOneAssignment({
        trainingId: input.trainingId,
        userId,
        assignedBy,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      });
      results.push({ userId, assignmentId: assignment.id });
    } catch (err) {
      results.push({
        userId,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }

  return {
    total: input.userIds.length,
    succeeded: results.filter((r) => r.assignmentId).length,
    failed: results.filter((r) => r.error).length,
    results,
  };
}

// ─── Leitura ─────────────────────────────────────────────────

export async function listMyAssignments(userId: string, query: ListMyAssignmentsQuery) {
  const where: Prisma.AssignmentWhereInput = { userId };
  if (query.status && query.status.length > 0) where.status = { in: query.status };
  if (query.q) {
    where.training = { title: { contains: query.q, mode: 'insensitive' } };
  }

  const [items, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { assignedAt: 'desc' }],
      include: {
        training: {
          select: {
            id: true,
            title: true,
            category: true,
            isMandatory: true,
            coverUrl: true,
          },
        },
        modulesProgress: {
          select: { status: true, moduleId: true, completedAt: true },
        },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.assignment.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function getAssignmentDetail(userId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    include: {
      training: true,
      trainingVersion: { select: { version: true } },
      modulesProgress: {
        include: { module: true },
        orderBy: { module: { orderIndex: 'asc' } },
      },
    },
  });

  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  // Hidrata módulos que ainda não têm progresso (apenas para visualização)
  const modulesAll = await prisma.module.findMany({
    where: { trainingId: assignment.trainingId },
    orderBy: { orderIndex: 'asc' },
  });

  return {
    assignment,
    modules: modulesAll.map((m) => {
      const progress = assignment.modulesProgress.find((p) => p.moduleId === m.id);
      return {
        module: m,
        progress: progress ?? null,
      };
    }),
  };
}

export async function summaryForUser(userId: string) {
  const [active, completed, overdue, allAssignments] = await Promise.all([
    prisma.assignment.count({
      where: {
        userId,
        status: { in: [AssignmentStatus.IN_PROGRESS, AssignmentStatus.NOT_STARTED, AssignmentStatus.WAITING] },
      },
    }),
    prisma.assignment.count({ where: { userId, status: AssignmentStatus.COMPLETED } }),
    prisma.assignment.count({ where: { userId, status: AssignmentStatus.OVERDUE } }),
    prisma.assignment.findMany({
      where: { userId },
      select: { progressPct: true, finalScore: true, status: true },
    }),
  ]);

  const activeAssignments = allAssignments.filter(
    (a) => a.status !== AssignmentStatus.COMPLETED && a.status !== AssignmentStatus.OVERDUE,
  );
  const avgProgressPct =
    activeAssignments.length > 0
      ? activeAssignments.reduce((acc, a) => acc + Number(a.progressPct ?? 0), 0) /
        activeAssignments.length
      : 0;

  const scored = allAssignments.filter((a) => a.finalScore !== null);
  const avgScorePct =
    scored.length > 0
      ? scored.reduce((acc, a) => acc + Number(a.finalScore ?? 0), 0) / scored.length
      : 0;

  return {
    kpis: {
      active,
      completed,
      overdue,
      avg_progress_pct: Number(avgProgressPct.toFixed(2)),
      avg_score_pct: Number(avgScorePct.toFixed(2)),
    },
  };
}

// ─── Admin: lista atribuições de qualquer usuário ────────────

export async function listAssignmentsForUser(userId: string, query: ListMyAssignmentsQuery) {
  return listMyAssignments(userId, query);
}

export async function getAssignmentForUser(userId: string, assignmentId: string) {
  return getAssignmentDetail(userId, assignmentId);
}

// ─── Cálculo de progresso ────────────────────────────────────

export async function recalculateAssignmentProgress(assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      training: { include: { modules: { where: { isRequired: true } } } },
      modulesProgress: true,
    },
  });
  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  const requiredCount = assignment.training.modules.length;
  if (requiredCount === 0) return assignment;

  const completedCount = assignment.modulesProgress.filter(
    (p) =>
      p.status === ModuleProgressStatus.COMPLETED &&
      assignment.training.modules.some((m) => m.id === p.moduleId),
  ).length;

  const progressPct = (completedCount / requiredCount) * 100;
  const isCompleted = completedCount === requiredCount;

  const data: Prisma.AssignmentUpdateInput = {
    progressPct: new Prisma.Decimal(progressPct.toFixed(2)),
  };

  if (isCompleted && assignment.status !== AssignmentStatus.COMPLETED) {
    data.status = AssignmentStatus.COMPLETED;
    data.completedAt = new Date();

    await prisma.activityEvent.create({
      data: {
        userId: assignment.userId,
        type: 'training.completed',
        trainingId: assignment.trainingId,
        payload: { assignmentId } as Prisma.InputJsonValue,
      },
    });
  } else if (!isCompleted && completedCount > 0 && assignment.status === AssignmentStatus.NOT_STARTED) {
    data.status = AssignmentStatus.IN_PROGRESS;
    data.startedAt = assignment.startedAt ?? new Date();
  }

  // Verifica se está atrasado
  if (
    !isCompleted &&
    assignment.dueAt &&
    assignment.dueAt < new Date() &&
    assignment.status !== AssignmentStatus.OVERDUE
  ) {
    data.status = AssignmentStatus.OVERDUE;
  }

  return prisma.assignment.update({ where: { id: assignmentId }, data });
}

// ─── Gate de permissão: pode ver atribuições deste user? ─────

export function canViewAssignmentsOf(viewerRole: string, viewerId: string, targetUserId: string) {
  if (viewerRole === 'SUPER_ADMIN') return true;
  if (viewerId === targetUserId) return true;
  // Gestor/escopo de time é Fase 4 — por enquanto admin vê tudo, colaborador vê só si
  if (viewerRole === 'ADMIN' && viewerId !== targetUserId) {
    // Admin tem acesso total nesta fase
    return true;
  }
  return false;
}

export function assertCanView(viewerRole: string, viewerId: string, targetUserId: string) {
  if (!canViewAssignmentsOf(viewerRole, viewerId, targetUserId)) {
    throw new BadRequestError('Sem permissão para ver atribuições deste usuário');
  }
}
