// Certificado de conclusão — gera HTML/PDF auditável
// Spec: task-criacao-treinamento.md §5 (Etapa 3 → "Certificado ao concluir")
//
// Implementação: gera HTML estático com hash SHA-256 da conclusão.
// HTML pode ser impresso/salvo como PDF pelo navegador (window.print()).
// Para PDF de verdade, usar puppeteer ou pdf-lib em uma fase futura.

import { createHash } from 'crypto';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../utils/errors';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLongDate(d: Date): string {
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export interface CertificateData {
  assignmentId: string;
  hash: string;
  userName: string;
  trainingTitle: string;
  trainingVersion: string;
  completedAt: Date;
  durationMin: number;
}

export async function buildCertificate(
  userId: string,
  assignmentId: string,
): Promise<{ html: string; data: CertificateData }> {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, userId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      training: {
        include: {
          modules: { select: { durationMin: true } },
        },
      },
      trainingVersion: { select: { version: true } },
    },
  });

  if (!assignment) throw new NotFoundError('Atribuição não encontrada');
  if (assignment.status !== 'COMPLETED') {
    throw new BadRequestError('Treinamento ainda não foi concluído');
  }
  if (!assignment.training.hasCertificate) {
    throw new BadRequestError('Este treinamento não emite certificado');
  }

  const completedAt = assignment.completedAt ?? new Date();
  const durationMin = assignment.training.modules.reduce(
    (s, m) => s + (m.durationMin || 0),
    0,
  );

  // Hash auditável: combina dados estáticos para gerar fingerprint único
  const hashInput = [
    assignment.id,
    assignment.user.id,
    assignment.training.id,
    assignment.trainingVersion.version,
    completedAt.toISOString(),
  ].join('|');
  const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16).toUpperCase();

  const data: CertificateData = {
    assignmentId: assignment.id,
    hash,
    userName: assignment.user.name,
    trainingTitle: assignment.training.title,
    trainingVersion: assignment.trainingVersion.version,
    completedAt,
    durationMin,
  };

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Certificado — ${escapeHtml(data.trainingTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: 'Georgia', serif;
      background: linear-gradient(135deg, #0d0e16 0%, #1a1d2e 100%);
      color: #f0f0f0;
      width: 297mm; height: 210mm;
      display: flex; align-items: center; justify-content: center;
    }
    .cert {
      width: calc(100% - 60px); height: calc(100% - 60px);
      margin: 30px;
      border: 2px solid #8b5cf6;
      padding: 50px 60px;
      position: relative;
      background: linear-gradient(180deg, rgba(99,102,241,0.05) 0%, rgba(0,0,0,0) 50%);
    }
    .cert::before {
      content: '';
      position: absolute; inset: 8px;
      border: 1px solid rgba(139,92,246,0.3);
      pointer-events: none;
    }
    .brand {
      display: flex; align-items: center; gap: 14px;
      margin-bottom: 36px;
    }
    .brand-box {
      width: 44px; height: 44px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 8px;
    }
    .brand-name {
      font-family: 'Helvetica Neue', sans-serif;
      font-weight: 700; letter-spacing: 4px; font-size: 14px;
    }
    .brand-sub {
      font-size: 10px; color: #888; letter-spacing: 2px; margin-top: 2px;
    }
    .title {
      font-size: 14px; letter-spacing: 6px; color: #8b5cf6;
      text-transform: uppercase; margin-bottom: 18px;
    }
    .name {
      font-family: 'Helvetica Neue', sans-serif;
      font-size: 52px; font-weight: 300; color: #fff;
      margin: 0 0 24px; line-height: 1.1;
    }
    .body {
      font-size: 17px; line-height: 1.7; color: #d0d0d0;
      max-width: 700px;
    }
    .body strong { color: #fff; font-weight: 700; }
    .footer {
      position: absolute;
      bottom: 50px; left: 60px; right: 60px;
      display: flex; justify-content: space-between; align-items: flex-end;
      font-size: 12px; color: #888;
    }
    .footer .meta div { margin-bottom: 4px; }
    .footer .hash {
      font-family: 'Courier New', monospace; font-size: 11px; color: #8b5cf6;
      letter-spacing: 1px;
    }
    .signature-line {
      width: 200px; border-top: 1px solid #555; padding-top: 6px;
      font-size: 11px; color: #999; text-align: center;
    }
    @media print {
      body { background: #0d0e16; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="cert">
    <div class="brand">
      <div class="brand-box"></div>
      <div>
        <div class="brand-name">SIETCH</div>
        <div class="brand-sub">METRICS</div>
      </div>
    </div>

    <div class="title">Certificado de Conclusão</div>

    <div class="name">${escapeHtml(data.userName)}</div>

    <div class="body">
      concluiu com êxito o treinamento <strong>${escapeHtml(data.trainingTitle)}</strong>
      (versão ${escapeHtml(data.trainingVersion)}),
      com carga horária estimada de <strong>${Math.round(data.durationMin / 60 * 10) / 10} horas</strong>,
      em <strong>${escapeHtml(formatLongDate(completedAt))}</strong>.
    </div>

    <div class="footer">
      <div class="meta">
        <div>ID da atribuição: ${escapeHtml(data.assignmentId)}</div>
        <div>Concluído em: ${escapeHtml(completedAt.toISOString().slice(0, 19).replace('T', ' '))}</div>
        <div class="hash">Hash: ${escapeHtml(data.hash)}</div>
      </div>
      <div class="signature-line">
        Sietch Metrics — RH
      </div>
    </div>
  </div>
</body>
</html>`;

  return { html, data };
}
