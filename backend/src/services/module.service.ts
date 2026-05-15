import { Prisma, ModuleType, TrainingStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import type { CreateModuleInput, UpdateModuleInput } from '../schemas/training.schema';

const TYPE_MAP: Record<string, ModuleType> = {
  VIDEO: ModuleType.VIDEO,
  ARTICLE: ModuleType.ARTICLE,
  QUIZ: ModuleType.QUIZ,
  TASK: ModuleType.TASK,
  POLICY: ModuleType.POLICY,
  LIVE: ModuleType.LIVE,
};

async function assertEditable(trainingId: string) {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { id: true, status: true },
  });
  if (!training) throw new NotFoundError('Treinamento não encontrado');
  if (training.status === TrainingStatus.ARCHIVED) {
    throw new ConflictError('Não é possível editar módulos de treinamento arquivado');
  }
  return training;
}

export async function listModules(trainingId: string) {
  await assertEditable(trainingId).catch(() => {
    /* permite ler módulos mesmo se arquivado */
  });

  return prisma.module.findMany({
    where: { trainingId },
    orderBy: { orderIndex: 'asc' },
  });
}

export async function getModuleById(trainingId: string, moduleId: string) {
  const mod = await prisma.module.findFirst({ where: { id: moduleId, trainingId } });
  if (!mod) throw new NotFoundError('Módulo não encontrado');
  return mod;
}

export async function createModule(trainingId: string, input: CreateModuleInput) {
  await assertEditable(trainingId);

  // Próximo orderIndex
  const last = await prisma.module.findFirst({
    where: { trainingId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  });
  const orderIndex = (last?.orderIndex ?? -1) + 1;

  const type = TYPE_MAP[input.type];
  if (!type) throw new BadRequestError(`Tipo de módulo inválido: ${input.type}`);

  return prisma.module.create({
    data: {
      trainingId,
      orderIndex,
      type,
      title: input.title,
      description: input.description ?? null,
      durationMin: input.durationMin,
      isRequired: input.isRequired,
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
}

export async function updateModule(
  trainingId: string,
  moduleId: string,
  input: UpdateModuleInput,
) {
  await assertEditable(trainingId);
  const existing = await prisma.module.findFirst({ where: { id: moduleId, trainingId } });
  if (!existing) throw new NotFoundError('Módulo não encontrado');

  const data: Prisma.ModuleUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.durationMin !== undefined) data.durationMin = input.durationMin;
  if (input.isRequired !== undefined) data.isRequired = input.isRequired;
  if (input.payload !== undefined) data.payload = input.payload as Prisma.InputJsonValue;

  return prisma.module.update({ where: { id: moduleId }, data });
}

export async function deleteModule(trainingId: string, moduleId: string) {
  await assertEditable(trainingId);
  const existing = await prisma.module.findFirst({
    where: { id: moduleId, trainingId },
    select: { id: true, orderIndex: true },
  });
  if (!existing) throw new NotFoundError('Módulo não encontrado');

  // Verifica se há progresso registrado — bloqueia exclusão se sim (regra §11.1)
  const hasProgress = await prisma.moduleProgress.count({ where: { moduleId } });
  if (hasProgress > 0) {
    throw new ConflictError(
      'Módulo possui progresso de colaboradores. Para alterá-lo, publique uma nova versão.',
    );
  }

  await prisma.$transaction([
    prisma.module.delete({ where: { id: moduleId } }),
    // Reordena módulos seguintes (preenche o gap)
    prisma.module.updateMany({
      where: { trainingId, orderIndex: { gt: existing.orderIndex } },
      data: { orderIndex: { decrement: 1 } },
    }),
  ]);

  return { deleted: true };
}

/**
 * Reordena todos os módulos do treinamento.
 * `order` deve conter TODOS os IDs de módulo na ordem desejada.
 */
export async function reorderModules(trainingId: string, order: string[]) {
  await assertEditable(trainingId);

  const existing = await prisma.module.findMany({
    where: { trainingId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((m) => m.id));

  if (order.length !== existing.length) {
    throw new BadRequestError(
      `Reorder precisa incluir todos os ${existing.length} módulos do treinamento`,
    );
  }
  for (const id of order) {
    if (!existingIds.has(id)) {
      throw new BadRequestError(`Módulo ${id} não pertence a este treinamento`);
    }
  }

  // Para evitar violação da constraint UNIQUE(trainingId, orderIndex) durante o swap,
  // primeiro setamos todos para valores negativos (temporários), depois para os finais.
  await prisma.$transaction([
    ...order.map((id, idx) =>
      prisma.module.update({
        where: { id },
        data: { orderIndex: -(idx + 1) - 1000 },
      }),
    ),
    ...order.map((id, idx) =>
      prisma.module.update({
        where: { id },
        data: { orderIndex: idx },
      }),
    ),
  ]);

  return prisma.module.findMany({
    where: { trainingId },
    orderBy: { orderIndex: 'asc' },
  });
}
