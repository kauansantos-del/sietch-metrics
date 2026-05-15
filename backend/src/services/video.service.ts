import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { completeModule } from './module-progress.service';

interface VideoPayload {
  provider: 'youtube' | 'vimeo' | 'upload';
  source: Record<string, unknown>;
  min_watch_pct?: number;
}

type Interval = [number, number]; // segundos: [start, end]

/**
 * Merge de intervalos sobrepostos/contíguos.
 * Garante que watched_pct nunca conte trecho duas vezes.
 * Tolerância de 1s para juntar intervalos quase-contíguos.
 */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (s <= last[1] + 1) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }

  return merged;
}

function totalCovered(intervals: Interval[]): number {
  return intervals.reduce((sum, [s, e]) => sum + Math.max(0, e - s), 0);
}

// ─── Reportar progresso de vídeo ─────────────────────────────

export interface VideoProgressInput {
  event: 'play' | 'pause' | 'seek' | 'tick' | 'ended' | 'error';
  currentTimeSec: number;
  durationSec: number;
  sessionId?: string;
  // Intervalo coberto desde o último tick (opcional — preferido)
  intervalCovered?: Interval;
}

export async function reportProgress(
  userId: string,
  moduleId: string,
  input: VideoProgressInput,
) {
  // Garante que o módulo é VIDEO
  const mod = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!mod) throw new NotFoundError('Módulo não encontrado');
  if (mod.type !== 'VIDEO') throw new BadRequestError('Módulo não é vídeo');

  const payload = mod.payload as unknown as VideoPayload;
  const minWatchPct = payload?.min_watch_pct ?? 90;

  // Carrega ou cria progresso
  let progress = await prisma.videoProgress.findUnique({
    where: { userId_moduleId: { userId, moduleId } },
  });

  const existingIntervals: Interval[] = progress?.watchedIntervals
    ? (progress.watchedIntervals as unknown as Interval[])
    : [];

  // Adiciona o novo intervalo (se vier) — senão, usa [previous, current]
  // como heurística (frontend deveria mandar intervalCovered explicitamente)
  let newIntervals = [...existingIntervals];
  if (input.intervalCovered) {
    newIntervals.push(input.intervalCovered);
  } else if (input.event === 'tick' || input.event === 'ended') {
    const lastEnd = progress?.lastPosition ?? Math.max(0, input.currentTimeSec - 5);
    if (input.currentTimeSec > lastEnd) {
      newIntervals.push([lastEnd, input.currentTimeSec]);
    }
  }

  const merged = mergeIntervals(newIntervals);
  const covered = totalCovered(merged);
  const watchedPct = input.durationSec > 0 ? (covered / input.durationSec) * 100 : 0;

  const data: Prisma.VideoProgressUpdateInput = {
    watchedIntervals: merged as unknown as Prisma.InputJsonValue,
    watchedPct: new Prisma.Decimal(Math.min(100, watchedPct).toFixed(2)),
    lastPosition: Math.max(progress?.lastPosition ?? 0, Math.round(input.currentTimeSec)),
  };

  const justCompleted =
    !progress?.completedAt && watchedPct >= minWatchPct;
  if (justCompleted) {
    data.completedAt = new Date();
  }

  if (progress) {
    progress = await prisma.videoProgress.update({
      where: { id: progress.id },
      data,
    });
  } else {
    progress = await prisma.videoProgress.create({
      data: {
        userId,
        moduleId,
        watchedIntervals: merged as unknown as Prisma.InputJsonValue,
        watchedPct: new Prisma.Decimal(Math.min(100, watchedPct).toFixed(2)),
        lastPosition: Math.round(input.currentTimeSec),
        completedAt: justCompleted ? new Date() : null,
      },
    });
  }

  // Se atingiu threshold, completa o módulo (precisa do assignmentId)
  // Tentamos achar o assignment ativo desse user para esse training
  if (justCompleted) {
    const assignment = await prisma.assignment.findFirst({
      where: {
        userId,
        trainingId: mod.trainingId,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
    });
    if (assignment) {
      await completeModule(userId, assignment.id, moduleId);
    }
  }

  return {
    watched_pct: Number(progress.watchedPct),
    last_position: progress.lastPosition,
    completed: progress.completedAt !== null,
  };
}

export async function getProgress(userId: string, moduleId: string) {
  const progress = await prisma.videoProgress.findUnique({
    where: { userId_moduleId: { userId, moduleId } },
  });
  if (!progress) {
    return {
      watched_pct: 0,
      last_position: 0,
      completed: false,
      intervals: [],
    };
  }
  return {
    watched_pct: Number(progress.watchedPct),
    last_position: progress.lastPosition,
    completed: progress.completedAt !== null,
    intervals: progress.watchedIntervals,
  };
}

// ─── Resolver URL/ID do provider externo ─────────────────────

const YT_REGEXES = [
  /youtube\.com\/watch\?v=([\w-]{11})/,
  /youtu\.be\/([\w-]{11})/,
  /youtube\.com\/embed\/([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
];

const VIMEO_REGEXES = [
  /vimeo\.com\/(\d+)(?:\/([\w-]+))?/,
  /player\.vimeo\.com\/video\/(\d+)/,
];

export function resolveVideoInput(provider: 'youtube' | 'vimeo', input: string) {
  if (provider === 'youtube') {
    // ID puro (11 chars)
    if (/^[\w-]{11}$/.test(input)) {
      return { valid: true, video_id: input, embed_url: `https://www.youtube-nocookie.com/embed/${input}` };
    }
    for (const re of YT_REGEXES) {
      const m = input.match(re);
      if (m?.[1]) {
        return {
          valid: true,
          video_id: m[1],
          embed_url: `https://www.youtube-nocookie.com/embed/${m[1]}`,
        };
      }
    }
    return { valid: false, code: 'INVALID_URL' };
  }

  if (provider === 'vimeo') {
    for (const re of VIMEO_REGEXES) {
      const m = input.match(re);
      if (m?.[1]) {
        return {
          valid: true,
          video_id: m[1],
          unlisted_hash: m[2] ?? null,
          embed_url: `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ''}`,
        };
      }
    }
    return { valid: false, code: 'INVALID_URL' };
  }

  return { valid: false, code: 'INVALID_PROVIDER' };
}
