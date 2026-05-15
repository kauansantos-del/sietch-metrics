// Upload de capas e vídeos via Supabase Storage
// Spec: task-criacao-treinamento.md §7.1 + task-embed-video.md §4.3

import { randomUUID } from 'crypto';
import { Prisma, VideoAssetStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { getSupabaseStorage, STORAGE_BUCKET } from '../config/storage';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';

const COVER_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const COVER_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];
const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

interface UploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function ensureStorage() {
  const client = getSupabaseStorage();
  if (!client) {
    throw new ConflictError(
      'Supabase Storage não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env',
    );
  }
  return client;
}

// ─── Capa do treinamento ─────────────────────────────────────

export async function uploadCover(file: UploadFile): Promise<{ url: string; path: string }> {
  if (!COVER_MIME.includes(file.mimetype)) {
    throw new BadRequestError(`Tipo inválido. Aceitos: ${COVER_MIME.join(', ')}`);
  }
  if (file.size > COVER_MAX_BYTES) {
    throw new BadRequestError(`Arquivo > 2MB (recebido ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  const client = ensureStorage();
  const ext = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `covers/${randomUUID()}.${ext}`;

  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (error) throw new ConflictError(`Falha no upload: ${error.message}`);

  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// ─── Vídeo (upload simples — para HLS use Mux/CF Stream) ─────

export async function createVideoAsset(
  uploadedBy: string,
  file: UploadFile,
): Promise<{
  assetId: string;
  status: VideoAssetStatus;
  url: string;
  playbackId: string;
}> {
  if (!VIDEO_MIME.includes(file.mimetype)) {
    throw new BadRequestError(`Tipo inválido. Aceitos: ${VIDEO_MIME.join(', ')}`);
  }
  if (file.size > VIDEO_MAX_BYTES) {
    throw new BadRequestError('Arquivo > 2GB');
  }

  const client = ensureStorage();
  const assetId = randomUUID();
  const ext = file.originalname.split('.').pop()?.toLowerCase() || 'mp4';
  const path = `videos/${assetId}.${ext}`;

  // Cria asset em PROCESSING (no Supabase Storage simples, fica READY direto)
  const asset = await prisma.videoAsset.create({
    data: {
      id: assetId,
      uploadedBy,
      filename: file.originalname,
      sizeBytes: BigInt(file.size),
      status: VideoAssetStatus.UPLOADING,
      storageKey: path,
    },
  });

  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

  if (error) {
    await prisma.videoAsset.update({
      where: { id: asset.id },
      data: { status: VideoAssetStatus.ERROR, errorMessage: error.message },
    });
    throw new ConflictError(`Falha no upload: ${error.message}`);
  }

  // Sem transcoder real → marcamos READY direto (single-quality MP4)
  const { data: pub } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  const updated = await prisma.videoAsset.update({
    where: { id: asset.id },
    data: {
      status: VideoAssetStatus.READY,
      playbackId: pub.publicUrl,
      readyAt: new Date(),
    },
  });

  return {
    assetId: updated.id,
    status: updated.status,
    url: pub.publicUrl,
    playbackId: pub.publicUrl,
  };
}

export async function getVideoAsset(assetId: string) {
  const asset = await prisma.videoAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new NotFoundError('Asset não encontrado');

  return {
    assetId: asset.id,
    status: asset.status,
    filename: asset.filename,
    sizeBytes: asset.sizeBytes.toString(),
    durationSec: asset.durationSec,
    playbackId: asset.playbackId,
    error: asset.errorMessage,
  };
}

/**
 * URL assinada de curta duração para playback do upload.
 * Em produção com bucket privado, recomendado. Aqui (público) só retorna o URL.
 */
export async function getPlaybackUrl(assetId: string): Promise<{
  hls_url: string;
  expires_at: string;
}> {
  const asset = await prisma.videoAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new NotFoundError('Asset não encontrado');
  if (asset.status !== VideoAssetStatus.READY) {
    throw new ConflictError(`Asset não está pronto (status: ${asset.status})`);
  }
  if (!asset.storageKey) {
    throw new ConflictError('Asset sem storageKey');
  }

  const client = ensureStorage();
  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(asset.storageKey, 60 * 15); // 15 min

  if (error || !data) {
    // Fallback pra URL pública se bucket for público
    const { data: pub } = client.storage.from(STORAGE_BUCKET).getPublicUrl(asset.storageKey);
    return {
      hls_url: pub.publicUrl,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  return {
    hls_url: data.signedUrl,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}
