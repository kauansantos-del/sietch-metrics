import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { completeModule } from './module-progress.service';

interface PolicyPayload {
  policy_ref: string;
  policy_version: string;
  effective_date: string;
  content_md: string;
  require_full_scroll?: boolean;
  accept_label: string;
}

// ─── Aceitar política ────────────────────────────────────────

export interface AcceptPolicyInput {
  readingTimeSec?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function acceptPolicy(
  userId: string,
  assignmentId: string,
  moduleId: string,
  input: AcceptPolicyInput,
) {
  // Verifica assignment do user
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    select: { id: true, trainingId: true },
  });
  if (!assignment) throw new NotFoundError('Atribuição não encontrada');

  const mod = await prisma.module.findFirst({
    where: { id: moduleId, trainingId: assignment.trainingId },
  });
  if (!mod) throw new NotFoundError('Módulo não pertence a esta atribuição');
  if (mod.type !== 'POLICY') throw new BadRequestError('Módulo não é do tipo policy');

  const payload = mod.payload as unknown as PolicyPayload;
  if (!payload?.policy_ref || !payload?.policy_version) {
    throw new BadRequestError('Módulo de política mal configurado');
  }

  // Bloqueia aceite duplicado da MESMA versão
  const existing = await prisma.policyAcceptance.findFirst({
    where: {
      userId,
      policyRef: payload.policy_ref,
      policyVersion: payload.policy_version,
    },
  });
  if (existing) {
    // Idempotência — não duplica
    return existing;
  }

  const acceptance = await prisma.policyAcceptance.create({
    data: {
      userId,
      policyRef: payload.policy_ref,
      policyVersion: payload.policy_version,
      moduleId,
      contentSnapshot: payload.content_md, // snapshot imutável
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      readingTimeSec: input.readingTimeSec ?? null,
    },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      type: 'policy.accepted',
      moduleId,
      payload: {
        policyRef: payload.policy_ref,
        policyVersion: payload.policy_version,
        acceptanceId: acceptance.id,
      } as Prisma.InputJsonValue,
    },
  });

  // Conclui o módulo automaticamente
  await completeModule(userId, assignmentId, moduleId);

  return acceptance;
}

// ─── Listar aceites do usuário ───────────────────────────────

export async function listAcceptances(userId: string) {
  const items = await prisma.policyAcceptance.findMany({
    where: { userId },
    orderBy: { acceptedAt: 'desc' },
    select: {
      id: true,
      policyRef: true,
      policyVersion: true,
      moduleId: true,
      acceptedAt: true,
      ipAddress: true,
      userAgent: true,
      readingTimeSec: true,
    },
  });

  return { items };
}

export async function getAcceptanceSnapshot(viewerId: string, acceptanceId: string, isAdmin: boolean) {
  const item = await prisma.policyAcceptance.findUnique({ where: { id: acceptanceId } });
  if (!item) throw new NotFoundError('Aceite não encontrado');

  if (!isAdmin && item.userId !== viewerId) {
    throw new NotFoundError('Aceite não encontrado');
  }

  return {
    id: item.id,
    policyRef: item.policyRef,
    policyVersion: item.policyVersion,
    acceptedAt: item.acceptedAt,
    contentSnapshot: item.contentSnapshot,
  };
}
