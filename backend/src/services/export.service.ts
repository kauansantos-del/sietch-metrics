// Exportações — CSV de treinamentos, aceites de política, etc.
// Spec: task-progressao-colaborador.md §9.9
// Implementação síncrona (sem fila) — adequada para volumes < 10k linhas.

import { prisma } from '../config/prisma';
import { NotFoundError } from '../utils/errors';
import { createHash } from 'crypto';

// ─── Utils ───────────────────────────────────────────────────

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsv).join(';')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(';'));
  }
  return lines.join('\n');
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19);
}

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Não iniciado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  OVERDUE: 'Atrasado',
  WAITING: 'Aguardando',
};

// ─── Export: todos os treinamentos de um usuário ─────────────

export async function exportUserTrainingsCSV(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new NotFoundError('Usuário não encontrado');

  const assignments = await prisma.assignment.findMany({
    where: { userId },
    orderBy: { assignedAt: 'desc' },
    include: {
      training: { select: { title: true, category: true, isMandatory: true } },
      trainingVersion: { select: { version: true } },
      assignedByUser: { select: { name: true } },
    },
  });

  const headers = [
    'Colaborador',
    'Email',
    'Treinamento',
    'Categoria',
    'Versão',
    'Obrigatório',
    'Status',
    'Progresso (%)',
    'Nota Final (%)',
    'Atribuído por',
    'Atribuído em',
    'Prazo',
    'Iniciado em',
    'Concluído em',
  ];

  const rows = assignments.map((a) => [
    user.name,
    user.email,
    a.training.title,
    a.training.category,
    a.trainingVersion.version,
    a.training.isMandatory ? 'Sim' : 'Não',
    STATUS_LABEL[a.status] ?? a.status,
    Number(a.progressPct).toFixed(2),
    a.finalScore !== null ? Number(a.finalScore).toFixed(2) : '',
    a.assignedByUser?.name ?? '',
    formatDateTime(a.assignedAt),
    formatDate(a.dueAt),
    formatDateTime(a.startedAt),
    formatDateTime(a.completedAt),
  ]);

  return buildCsv(headers, rows);
}

// ─── Export: aceites de política (auditoria/compliance) ──────

export async function exportUserAcceptancesCSV(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new NotFoundError('Usuário não encontrado');

  const items = await prisma.policyAcceptance.findMany({
    where: { userId },
    orderBy: { acceptedAt: 'desc' },
  });

  const headers = [
    'Colaborador',
    'Email',
    'Política',
    'Versão',
    'Aceito em',
    'IP',
    'User-Agent',
    'Tempo de leitura (s)',
    'Hash do snapshot',
  ];

  const rows = items.map((p) => {
    const hash = p.contentSnapshot
      ? createHash('sha256').update(p.contentSnapshot).digest('hex').slice(0, 16)
      : '';
    return [
      user.name,
      user.email,
      p.policyRef,
      p.policyVersion,
      formatDateTime(p.acceptedAt),
      p.ipAddress ?? '',
      p.userAgent ?? '',
      p.readingTimeSec ?? '',
      hash,
    ];
  });

  return buildCsv(headers, rows);
}

// ─── Export: progresso de um treinamento por toda a empresa ──

export async function exportTrainingProgressCSV(trainingId: string): Promise<string> {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { title: true, category: true },
  });
  if (!training) throw new NotFoundError('Treinamento não encontrado');

  const assignments = await prisma.assignment.findMany({
    where: { trainingId },
    orderBy: { assignedAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      trainingVersion: { select: { version: true } },
    },
  });

  const headers = [
    'Colaborador',
    'Email',
    'Versão',
    'Status',
    'Progresso (%)',
    'Nota Final (%)',
    'Atribuído em',
    'Prazo',
    'Concluído em',
  ];

  const rows = assignments.map((a) => [
    a.user.name,
    a.user.email,
    a.trainingVersion.version,
    STATUS_LABEL[a.status] ?? a.status,
    Number(a.progressPct).toFixed(2),
    a.finalScore !== null ? Number(a.finalScore).toFixed(2) : '',
    formatDateTime(a.assignedAt),
    formatDate(a.dueAt),
    formatDateTime(a.completedAt),
  ]);

  return buildCsv(headers, rows);
}
