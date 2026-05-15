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

interface ResolvedVideo {
  valid: boolean;
  code?: string;
  video_id?: string;
  unlisted_hash?: string | null;
  title?: string;
  duration_sec?: number | null;
  thumbnail_url?: string | null;
  embed_url?: string;
}

/**
 * Resolve via regex (rápido) + valida via oEmbed (real).
 * oEmbed do YouTube/Vimeo NÃO requer auth.
 */
export async function resolveVideoInput(
  provider: 'youtube' | 'vimeo',
  input: string,
): Promise<ResolvedVideo> {
  if (provider === 'youtube') {
    let videoId: string | undefined;

    if (/^[\w-]{11}$/.test(input)) {
      videoId = input;
    } else {
      for (const re of YT_REGEXES) {
        const m = input.match(re);
        if (m?.[1]) { videoId = m[1]; break; }
      }
    }

    if (!videoId) return { valid: false, code: 'INVALID_URL' };

    // Valida via oEmbed
    try {
      const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        return res.status === 401 || res.status === 403 || res.status === 404
          ? { valid: false, code: 'PRIVATE_OR_REMOVED' }
          : { valid: false, code: 'OEMBED_ERROR' };
      }
      const data = (await res.json()) as {
        title?: string;
        thumbnail_url?: string;
      };
      return {
        valid: true,
        video_id: videoId,
        title: data.title,
        thumbnail_url: data.thumbnail_url ?? null,
        duration_sec: null, // YouTube oEmbed não retorna duração
        embed_url: `https://www.youtube-nocookie.com/embed/${videoId}`,
      };
    } catch {
      // Falha de rede — devolve o que sabemos do regex
      return {
        valid: true,
        video_id: videoId,
        embed_url: `https://www.youtube-nocookie.com/embed/${videoId}`,
      };
    }
  }

  if (provider === 'vimeo') {
    let videoId: string | undefined;
    let unlistedHash: string | null = null;

    for (const re of VIMEO_REGEXES) {
      const m = input.match(re);
      if (m?.[1]) {
        videoId = m[1];
        unlistedHash = m[2] ?? null;
        break;
      }
    }

    if (!videoId) return { valid: false, code: 'INVALID_URL' };

    try {
      const url = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}${
        unlistedHash ? `/${unlistedHash}` : ''
      }`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        return res.status === 403 || res.status === 404
          ? { valid: false, code: 'PRIVATE_OR_REMOVED' }
          : { valid: false, code: 'OEMBED_ERROR' };
      }
      const data = (await res.json()) as {
        title?: string;
        thumbnail_url?: string;
        duration?: number;
      };
      return {
        valid: true,
        video_id: videoId,
        unlisted_hash: unlistedHash,
        title: data.title,
        thumbnail_url: data.thumbnail_url ?? null,
        duration_sec: data.duration ?? null,
        embed_url: `https://player.vimeo.com/video/${videoId}${unlistedHash ? `?h=${unlistedHash}` : ''}`,
      };
    } catch {
      return {
        valid: true,
        video_id: videoId,
        unlisted_hash: unlistedHash,
        embed_url: `https://player.vimeo.com/video/${videoId}${unlistedHash ? `?h=${unlistedHash}` : ''}`,
      };
    }
  }

  return { valid: false, code: 'INVALID_PROVIDER' };
}
