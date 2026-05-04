import { prisma } from '../config/prisma';
import { NotFoundError } from '../utils/errors';
import type { CreateCriterionInput, UpdateCriterionInput } from '../schemas/criterion.schema';

export async function listCriteria(ownerId: string) {
  return prisma.customCriterion.findMany({
    where: { ownerId, active: true },
    orderBy: [{ block: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createCriterion(ownerId: string, input: CreateCriterionInput) {
  // Default position = next available within the same block
  let position = input.position;
  if (position == null) {
    const last = await prisma.customCriterion.findFirst({
      where: { ownerId, block: input.block, active: true },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    position = (last?.position ?? -1) + 1;
  }

  return prisma.customCriterion.create({
    data: {
      ownerId,
      block: input.block,
      label: input.label,
      description: input.description ?? null,
      weight: input.weight,
      position,
    },
  });
}

export async function updateCriterion(
  id: string,
  ownerId: string,
  input: UpdateCriterionInput,
) {
  const existing = await prisma.customCriterion.findFirst({
    where: { id, ownerId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Critério não encontrado');

  return prisma.customCriterion.update({
    where: { id },
    data: {
      ...(input.block !== undefined && { block: input.block }),
      ...(input.label !== undefined && { label: input.label }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.weight !== undefined && { weight: input.weight }),
      ...(input.position !== undefined && { position: input.position }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });
}

export async function deleteCriterion(id: string, ownerId: string) {
  // Soft delete — preserva integridade caso já tenha sido usado em avaliações
  const existing = await prisma.customCriterion.findFirst({
    where: { id, ownerId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Critério não encontrado');

  await prisma.customCriterion.update({
    where: { id },
    data: { active: false },
  });
}
