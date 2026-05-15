import { ModuleProgressStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../utils/errors';
import { recalculateAssignmentProgress } from './assignment.service';
import type { UpdateModuleProgressInput } from '../schemas/training.schema';

async function getOrCreateProgress(userId: string, assignmentId: string, moduleId: string) {
  // Garantir que o assignment é do user
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    select: { id: true, trainingId: true },
  });
  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  const mod = await prisma.module.findFirst({
    where: { id: moduleId, trainingId: assignment.trainingId },
  });
  if (!mod) throw new NotFoundError('Módulo não pertence a esta atribuição');

  const existing = await prisma.moduleProgress.findUnique({
    where: { assignmentId_moduleId: { assignmentId, moduleId } },
  });

  if (existing) return existing;

  return prisma.moduleProgress.create({
    data: {
      assignmentId,
      moduleId,
      status: ModuleProgressStatus.NOT_STARTED,
    },
  });
}

export async function startModule(userId: string, assignmentId: string, moduleId: string) {
  const progress = await getOrCreateProgress(userId, assignmentId, moduleId);

  if (progress.status !== ModuleProgressStatus.NOT_STARTED) {
    return progress; // já iniciado
  }

  const updated = await prisma.moduleProgress.update({
    where: { id: progress.id },
    data: {
      status: ModuleProgressStatus.IN_PROGRESS,
      startedAt: new Date(),
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      type: 'module.started',
      moduleId,
      payload: { assignmentId } as Prisma.InputJsonValue,
    },
  });

  await recalculateAssignmentProgress(assignmentId);
  return updated;
}

export async function completeModule(userId: string, assignmentId: string, moduleId: string) {
  const progress = await getOrCreateProgress(userId, assignmentId, moduleId);

  if (progress.status === ModuleProgressStatus.COMPLETED) {
    return progress;
  }

  const updated = await prisma.moduleProgress.update({
    where: { id: progress.id },
    data: {
      status: ModuleProgressStatus.COMPLETED,
      completedAt: new Date(),
      startedAt: progress.startedAt ?? new Date(),
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      type: 'module.completed',
      moduleId,
      payload: { assignmentId } as Prisma.InputJsonValue,
    },
  });

  await recalculateAssignmentProgress(assignmentId);
  return updated;
}

export async function updateProgress(
  userId: string,
  assignmentId: string,
  moduleId: string,
  input: UpdateModuleProgressInput,
) {
  const progress = await getOrCreateProgress(userId, assignmentId, moduleId);

  const data: Prisma.ModuleProgressUpdateInput = {};

  if (input.status !== undefined) {
    data.status = input.status as ModuleProgressStatus;
    if (input.status === 'IN_PROGRESS' && !progress.startedAt) {
      data.startedAt = new Date();
    }
    if (input.status === 'COMPLETED') {
      data.completedAt = new Date();
      data.startedAt = progress.startedAt ?? new Date();
    }
  }

  if (input.timeSpentSec !== undefined) {
    data.timeSpentSec = (progress.timeSpentSec ?? 0) + input.timeSpentSec;
  }

  if (input.payload !== undefined) {
    data.payload = input.payload as Prisma.InputJsonValue;
  }

  const updated = await prisma.moduleProgress.update({
    where: { id: progress.id },
    data,
  });

  if (input.status === 'COMPLETED' && progress.status !== ModuleProgressStatus.COMPLETED) {
    await prisma.activityEvent.create({
      data: {
        userId,
        type: 'module.completed',
        moduleId,
        payload: { assignmentId } as Prisma.InputJsonValue,
      },
    });
  }

  await recalculateAssignmentProgress(assignmentId);
  return updated;
}
