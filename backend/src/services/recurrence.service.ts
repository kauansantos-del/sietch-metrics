// Reciclagem automática — task-criacao-treinamento.md §11.2
// "Reciclagem anual" dispara nova atribuição no aniversário da conclusão.

import { Prisma, TrainingStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

interface RecurrenceConfig {
  kind: 'never' | 'annual' | 'every_n_months';
  interval_months?: number;
}

function shouldRecycle(config: RecurrenceConfig, completedAt: Date, now: Date): boolean {
  if (config.kind === 'never') return false;

  const months =
    config.kind === 'annual' ? 12 : Math.max(1, config.interval_months ?? 12);
  const nextDue = new Date(completedAt);
  nextDue.setMonth(nextDue.getMonth() + months);

  return now >= nextDue;
}

/**
 * Roda uma passada do scheduler: identifica assignments concluídos cujos
 * treinamentos têm recurrence configurado e criam novas atribuições.
 *
 * Idempotente — se o usuário já tem uma assignment ativa na versão atual,
 * não cria duplicata.
 */
export async function runRecurrenceCheck(now: Date = new Date()): Promise<{
  checked: number;
  created: number;
}> {
  const completedAssignments = await prisma.assignment.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { not: null },
      training: {
        status: TrainingStatus.PUBLISHED,
        recurrence: { not: Prisma.JsonNull },
      },
    },
    include: {
      training: {
        include: {
          versions: { orderBy: { publishedAt: 'desc' }, take: 1 },
        },
      },
    },
  });

  let created = 0;

  for (const a of completedAssignments) {
    const recurrence = a.training.recurrence as unknown as RecurrenceConfig | null;
    if (!recurrence) continue;
    if (!a.completedAt) continue;

    if (!shouldRecycle(recurrence, a.completedAt, now)) continue;

    const latestVersion = a.training.versions[0];
    if (!latestVersion) continue;

    // Já existe atribuição ativa do mesmo user no mesmo treinamento (versão atual)?
    const existingActive = await prisma.assignment.findFirst({
      where: {
        userId: a.userId,
        trainingId: a.trainingId,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
    });
    if (existingActive) continue;

    const dueAt =
      a.training.deadlineDays != null
        ? new Date(now.getTime() + a.training.deadlineDays * 24 * 60 * 60 * 1000)
        : null;

    const newAssignment = await prisma.assignment.create({
      data: {
        userId: a.userId,
        trainingId: a.trainingId,
        trainingVersionId: latestVersion.id,
        assignedBy: a.assignedBy, // mantém o autor original
        dueAt,
        status: 'NOT_STARTED',
      },
    });

    await prisma.activityEvent.create({
      data: {
        userId: a.userId,
        type: 'recurrence.triggered',
        trainingId: a.trainingId,
        payload: {
          previousAssignmentId: a.id,
          newAssignmentId: newAssignment.id,
          kind: recurrence.kind,
        } as Prisma.InputJsonValue,
      },
    });

    created++;
  }

  logger.info({ checked: completedAssignments.length, created }, '[recurrence] check completed');
  return { checked: completedAssignments.length, created };
}

/**
 * Inicia o scheduler. Roda a cada hora.
 * Em produção, prefira um cron externo (Vercel Cron, GitHub Actions, etc.)
 * pra não acoplar com o lifecycle do servidor.
 */
let intervalHandle: NodeJS.Timeout | null = null;

export function startRecurrenceScheduler(intervalMs = 60 * 60 * 1000) {
  if (intervalHandle) return;

  logger.info({ intervalMs }, '[recurrence] scheduler started');

  // Roda 30s após boot pra dar tempo do servidor estabilizar
  setTimeout(() => {
    runRecurrenceCheck().catch((err) => logger.error({ err }, '[recurrence] check failed'));
  }, 30_000);

  intervalHandle = setInterval(() => {
    runRecurrenceCheck().catch((err) => logger.error({ err }, '[recurrence] check failed'));
  }, intervalMs);
}

export function stopRecurrenceScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
