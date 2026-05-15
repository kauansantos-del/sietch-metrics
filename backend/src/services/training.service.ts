import { Prisma, TrainingStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import type {
  CreateTrainingInput,
  ListTrainingsQuery,
  UpdateTrainingInput,
} from '../schemas/training.schema';

// ─── List + Get ──────────────────────────────────────────────

export async function listTrainings(query: ListTrainingsQuery) {
  const where: Prisma.TrainingWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.category) where.category = query.category;
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.training.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { modules: true, assignments: true } },
        author: { select: { id: true, name: true, email: true } },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.training.count({ where }),
  ]);

  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getTrainingById(id: string) {
  const training = await prisma.training.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, email: true } },
      modules: { orderBy: { orderIndex: 'asc' } },
      prerequisites: {
        include: {
          requiredTraining: { select: { id: true, title: true, status: true } },
        },
      },
      _count: { select: { assignments: true, versions: true } },
    },
  });

  if (!training) throw new NotFoundError('Treinamento não encontrado');
  return training;
}

// ─── Create / Update ─────────────────────────────────────────

export async function createTraining(authorId: string, input: CreateTrainingInput) {
  return prisma.training.create({
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      tags: input.tags,
      coverUrl: input.coverUrl ?? null,
      policyRef: input.policyRef ?? null,
      language: input.language,
      authorId,
      status: TrainingStatus.DRAFT,
    },
  });
}

export async function updateTraining(id: string, input: UpdateTrainingInput) {
  // Editar publicado abre um draft de nova versão (regra da spec §2.2)
  const existing = await prisma.training.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new NotFoundError('Treinamento não encontrado');

  const data: Prisma.TrainingUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.coverUrl !== undefined) data.coverUrl = input.coverUrl;
  if (input.policyRef !== undefined) data.policyRef = input.policyRef;
  if (input.language !== undefined) data.language = input.language;
  if (input.isMandatory !== undefined) data.isMandatory = input.isMandatory;
  if (input.deadlineDays !== undefined) data.deadlineDays = input.deadlineDays;
  if (input.passingScore !== undefined) data.passingScore = input.passingScore;
  if (input.maxAttempts !== undefined) data.maxAttempts = input.maxAttempts;
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (input.hasCertificate !== undefined) data.hasCertificate = input.hasCertificate;
  if (input.recurrence !== undefined) data.recurrence = input.recurrence as Prisma.InputJsonValue;

  // Se estava publicado, volta para draft
  if (existing.status === TrainingStatus.PUBLISHED) {
    data.status = TrainingStatus.DRAFT;
  }

  return prisma.training.update({ where: { id }, data });
}

export async function archiveTraining(id: string) {
  const existing = await prisma.training.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new NotFoundError('Treinamento não encontrado');
  if (existing.status === TrainingStatus.ARCHIVED) {
    throw new ConflictError('Treinamento já está arquivado');
  }

  return prisma.training.update({
    where: { id },
    data: { status: TrainingStatus.ARCHIVED },
  });
}

export async function unpublishTraining(id: string) {
  const existing = await prisma.training.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new NotFoundError('Treinamento não encontrado');
  if (existing.status !== TrainingStatus.PUBLISHED) {
    throw new ConflictError('Só é possível despublicar um treinamento publicado');
  }

  return prisma.training.update({
    where: { id },
    data: { status: TrainingStatus.DRAFT },
  });
}

// ─── Validar antes de publicar ───────────────────────────────

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export async function validateTrainingForPublish(id: string): Promise<{
  valid: boolean;
  errors: ValidationError[];
}> {
  const training = await prisma.training.findUnique({
    where: { id },
    include: { modules: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!training) throw new NotFoundError('Treinamento não encontrado');

  const errors: ValidationError[] = [];

  // Metadados básicos
  if (!training.title || training.title.length < 3) {
    errors.push({ field: 'title', code: 'TITLE_REQUIRED', message: 'Título obrigatório (3-80 chars)' });
  }
  if (!training.description || training.description.length < 20) {
    errors.push({
      field: 'description',
      code: 'DESCRIPTION_REQUIRED',
      message: 'Descrição obrigatória (20-500 chars)',
    });
  }

  // Pelo menos 1 módulo
  if (training.modules.length === 0) {
    errors.push({
      field: 'modules',
      code: 'MIN_MODULES',
      message: 'É necessário pelo menos 1 módulo',
    });
  }

  // Cada módulo precisa ser válido
  training.modules.forEach((m, idx) => {
    if (!m.title) {
      errors.push({
        field: `modules[${idx}].title`,
        code: 'MODULE_TITLE_REQUIRED',
        message: `Módulo ${idx + 1} sem título`,
      });
    }

    const payload = m.payload as Record<string, unknown> | null;

    if (m.type === 'QUIZ') {
      const questions = (payload?.questions as unknown[]) ?? [];
      if (questions.length < 3) {
        errors.push({
          field: `modules[${idx}].payload.questions`,
          code: 'MIN_QUESTIONS',
          message: `Quiz "${m.title}" precisa ter no mínimo 3 questões`,
        });
      }
    }

    if (m.type === 'POLICY') {
      if (!payload?.policy_ref) {
        errors.push({
          field: `modules[${idx}].payload.policy_ref`,
          code: 'POLICY_REF_REQUIRED',
          message: `Módulo de política "${m.title}" sem policy_ref`,
        });
      }
    }

    if (m.type === 'VIDEO') {
      const provider = payload?.provider;
      const source = payload?.source as Record<string, unknown> | undefined;
      if (!provider || !source) {
        errors.push({
          field: `modules[${idx}].payload`,
          code: 'VIDEO_SOURCE_REQUIRED',
          message: `Vídeo "${m.title}" sem provider/source`,
        });
      }
    }
  });

  // Pré-requisitos sem ciclos (validação simples — checa só 1 nível)
  const prereqs = await prisma.prerequisite.findMany({
    where: { trainingId: id },
    select: { requiredTrainingId: true },
  });
  for (const p of prereqs) {
    const reverse = await prisma.prerequisite.findUnique({
      where: {
        trainingId_requiredTrainingId: {
          trainingId: p.requiredTrainingId,
          requiredTrainingId: id,
        },
      },
    });
    if (reverse) {
      errors.push({
        field: 'prerequisites',
        code: 'PREREQUISITE_CYCLE',
        message: 'Pré-requisitos formam um ciclo',
      });
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Publish ─────────────────────────────────────────────────

function bumpVersion(current: string, kind: 'major' | 'minor'): string {
  const [maj, min] = current.split('.').map((n) => parseInt(n, 10) || 0);
  if (kind === 'major') return `${maj + 1}.0`;
  return `${maj}.${min + 1}`;
}

export async function publishTraining(
  id: string,
  publishedBy: string,
  versionBump: 'major' | 'minor' = 'minor',
) {
  const result = await validateTrainingForPublish(id);
  if (!result.valid) {
    throw new BadRequestError('Treinamento não passa nas validações', { errors: result.errors });
  }

  const training = await prisma.training.findUnique({
    where: { id },
    include: { modules: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!training) throw new NotFoundError('Treinamento não encontrado');

  const newVersion = bumpVersion(training.currentVersion, versionBump);

  // Snapshot imutável: training completo + módulos
  const snapshot = {
    training: {
      id: training.id,
      title: training.title,
      description: training.description,
      category: training.category,
      tags: training.tags,
      coverUrl: training.coverUrl,
      policyRef: training.policyRef,
      language: training.language,
      isMandatory: training.isMandatory,
      deadlineDays: training.deadlineDays,
      passingScore: training.passingScore,
      maxAttempts: training.maxAttempts,
      visibility: training.visibility,
      hasCertificate: training.hasCertificate,
      recurrence: training.recurrence,
    },
    modules: training.modules.map((m) => ({
      id: m.id,
      type: m.type,
      title: m.title,
      description: m.description,
      durationMin: m.durationMin,
      isRequired: m.isRequired,
      orderIndex: m.orderIndex,
      payload: m.payload,
    })),
  };

  const [, updated] = await prisma.$transaction([
    prisma.trainingVersion.create({
      data: {
        trainingId: id,
        version: newVersion,
        snapshot: snapshot as Prisma.InputJsonValue,
        publishedBy,
      },
    }),
    prisma.training.update({
      where: { id },
      data: {
        status: TrainingStatus.PUBLISHED,
        currentVersion: newVersion,
        publishedAt: new Date(),
      },
    }),
  ]);

  return updated;
}
