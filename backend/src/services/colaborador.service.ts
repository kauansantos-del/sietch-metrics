// Drill-down do colaborador — task-progressao-colaborador.md
// Endpoints de Relatórios / Da minha equipe / Meus treinamentos

import { AssignmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../utils/errors';

// ─── Header + KPIs ───────────────────────────────────────────

export async function getTrainingSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      picture: true,
      role: true,
      active: true,
    },
  });
  if (!user) throw new NotFoundError('Usuário não encontrado');

  const [active, completed, overdue, activeAssignments, scoredAssignments, recentEvent] =
    await Promise.all([
      prisma.assignment.count({
        where: {
          userId,
          status: {
            in: [
              AssignmentStatus.IN_PROGRESS,
              AssignmentStatus.NOT_STARTED,
              AssignmentStatus.WAITING,
            ],
          },
        },
      }),
      prisma.assignment.count({ where: { userId, status: AssignmentStatus.COMPLETED } }),
      prisma.assignment.count({ where: { userId, status: AssignmentStatus.OVERDUE } }),
      prisma.assignment.findMany({
        where: {
          userId,
          status: { in: [AssignmentStatus.IN_PROGRESS, AssignmentStatus.NOT_STARTED] },
        },
        select: { progressPct: true },
      }),
      prisma.assignment.findMany({
        where: { userId, finalScore: { not: null } },
        select: { finalScore: true },
      }),
      prisma.activityEvent.findFirst({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
        include: {
          training: { select: { title: true } },
          module: { select: { title: true } },
        },
      }),
    ]);

  const avgProgressPct =
    activeAssignments.length > 0
      ? activeAssignments.reduce((acc, a) => acc + Number(a.progressPct ?? 0), 0) /
        activeAssignments.length
      : 0;

  const avgScorePct =
    scoredAssignments.length > 0
      ? scoredAssignments.reduce((acc, a) => acc + Number(a.finalScore ?? 0), 0) /
        scoredAssignments.length
      : 0;

  // Alertas
  const overdueAssignments = await prisma.assignment.findMany({
    where: { userId, status: AssignmentStatus.OVERDUE },
    include: { training: { select: { id: true, title: true } } },
    take: 10,
  });

  const totalTimeSec = await prisma.moduleProgress.aggregate({
    where: { assignment: { userId } },
    _sum: { timeSpentSec: true },
  });

  return {
    user,
    kpis: {
      active,
      completed,
      overdue,
      avg_progress_pct: Number(avgProgressPct.toFixed(2)),
      avg_score_pct: Number(avgScorePct.toFixed(2)),
      total_time_sec: totalTimeSec._sum.timeSpentSec ?? 0,
    },
    alerts: overdueAssignments.map((a) => ({
      kind: 'overdue' as const,
      assignment_id: a.id,
      training_id: a.trainingId,
      training_title: a.training.title,
      days_overdue: a.dueAt
        ? Math.floor((Date.now() - a.dueAt.getTime()) / (24 * 60 * 60 * 1000))
        : 0,
    })),
    last_activity: recentEvent
      ? {
          type: recentEvent.type,
          training_title: recentEvent.training?.title ?? null,
          module_title: recentEvent.module?.title ?? null,
          occurred_at: recentEvent.occurredAt,
        }
      : null,
  };
}

// ─── Drill-down de uma atribuição ────────────────────────────

export async function getAssignmentDrilldown(userId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    include: {
      training: true,
      trainingVersion: { select: { version: true } },
      modulesProgress: {
        include: {
          module: true,
          quizAttempts: {
            select: {
              id: true,
              attemptNumber: true,
              startedAt: true,
              submittedAt: true,
              durationSec: true,
              scorePct: true,
              passed: true,
            },
            orderBy: { attemptNumber: 'desc' },
          },
          taskSubmissions: {
            include: { reviewer: { select: { id: true, name: true } } },
            orderBy: { submissionNumber: 'desc' },
          },
        },
      },
    },
  });

  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  // Inclui módulos sem progresso (para o player saber tudo que existe)
  const allModules = await prisma.module.findMany({
    where: { trainingId: assignment.trainingId },
    orderBy: { orderIndex: 'asc' },
  });

  // Videos progressos do user para esses módulos
  const videoIds = allModules.filter((m) => m.type === 'VIDEO').map((m) => m.id);
  const videoProgresses = await prisma.videoProgress.findMany({
    where: { userId, moduleId: { in: videoIds } },
  });

  const modules = allModules.map((m) => {
    const mp = assignment.modulesProgress.find((p) => p.moduleId === m.id);
    let detail: Record<string, unknown> = {};

    if (m.type === 'VIDEO') {
      const vp = videoProgresses.find((v) => v.moduleId === m.id);
      detail = {
        watched_pct: vp ? Number(vp.watchedPct) : 0,
        last_position: vp?.lastPosition ?? 0,
      };
    }

    if (m.type === 'QUIZ' && mp?.quizAttempts) {
      const best = mp.quizAttempts
        .filter((a) => a.scorePct !== null)
        .reduce<number>((acc, a) => Math.max(acc, Number(a.scorePct)), 0);
      detail = {
        attempts_used: mp.quizAttempts.length,
        best_score_pct: best,
        passed: mp.quizAttempts.some((a) => a.passed === true),
        attempts: mp.quizAttempts,
      };
    }

    if (m.type === 'TASK' && mp?.taskSubmissions) {
      detail = {
        submissions: mp.taskSubmissions,
      };
    }

    return {
      module: m,
      status: mp?.status ?? 'NOT_STARTED',
      started_at: mp?.startedAt ?? null,
      completed_at: mp?.completedAt ?? null,
      time_spent_sec: mp?.timeSpentSec ?? 0,
      detail,
    };
  });

  return {
    assignment: {
      id: assignment.id,
      training_id: assignment.trainingId,
      training_version: assignment.trainingVersion.version,
      training_title: assignment.training.title,
      training_category: assignment.training.category,
      is_mandatory: assignment.training.isMandatory,
      status: assignment.status,
      progress_pct: Number(assignment.progressPct),
      final_score: assignment.finalScore ? Number(assignment.finalScore) : null,
      assigned_at: assignment.assignedAt,
      due_at: assignment.dueAt,
      started_at: assignment.startedAt,
      completed_at: assignment.completedAt,
    },
    modules,
  };
}

// ─── Timeline ────────────────────────────────────────────────

export interface TimelineQuery {
  from?: Date;
  to?: Date;
  types?: string[];
  trainingId?: string;
  cursor?: string;
  limit: number;
}

export async function getTimeline(userId: string, q: TimelineQuery) {
  const where: Prisma.ActivityEventWhereInput = { userId };

  if (q.from || q.to) {
    where.occurredAt = {};
    if (q.from) where.occurredAt.gte = q.from;
    if (q.to) where.occurredAt.lte = q.to;
  }
  if (q.types && q.types.length > 0) where.type = { in: q.types };
  if (q.trainingId) where.trainingId = q.trainingId;
  if (q.cursor) where.id = { lt: q.cursor };

  const events = await prisma.activityEvent.findMany({
    where,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    include: {
      training: { select: { id: true, title: true } },
      module: { select: { id: true, title: true, type: true } },
    },
  });

  const hasMore = events.length > q.limit;
  const items = hasMore ? events.slice(0, q.limit) : events;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return {
    events: items.map((e) => ({
      id: e.id,
      type: e.type,
      occurred_at: e.occurredAt,
      training: e.training,
      module: e.module,
      payload: e.payload,
    })),
    next_cursor: nextCursor,
  };
}
