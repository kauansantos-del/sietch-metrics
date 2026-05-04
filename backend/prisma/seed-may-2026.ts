import { PrismaClient, Recommendation } from '@prisma/client';
import { calculateScores } from '../src/utils/classification';

const prisma = new PrismaClient();

// ─── Critérios (mesma estrutura do seed.ts principal) ────────────────────────

const TECH_CRITERIA = [
  { criterionKey: 'qualidade_tecnica',        block: 'TECNICO' as const, weight: 3 },
  { criterionKey: 'resolucao_problemas',      block: 'TECNICO' as const, weight: 3 },
  { criterionKey: 'conhecimento_ferramentas', block: 'TECNICO' as const, weight: 2 },
  { criterionKey: 'documentacao',             block: 'TECNICO' as const, weight: 1 },
  { criterionKey: 'boas_praticas',            block: 'TECNICO' as const, weight: 2 },
];

const BEHAV_CRITERIA = [
  { criterionKey: 'comunicacao',     block: 'COMPORTAMENTAL' as const, weight: 2 },
  { criterionKey: 'trabalho_equipe', block: 'COMPORTAMENTAL' as const, weight: 3 },
  { criterionKey: 'proatividade',    block: 'COMPORTAMENTAL' as const, weight: 2 },
  { criterionKey: 'comprometimento', block: 'COMPORTAMENTAL' as const, weight: 3 },
  { criterionKey: 'adaptabilidade',  block: 'COMPORTAMENTAL' as const, weight: 1 },
];

type ScoreArr = [number, number, number, number, number];

function buildScores(tech: ScoreArr, behav: ScoreArr) {
  return [
    ...TECH_CRITERIA.map((c, i) => ({ ...c, score: tech[i] })),
    ...BEHAV_CRITERIA.map((c, i) => ({ ...c, score: behav[i] })),
  ];
}

const PROFILES = {
  OTIMO_MAX:     buildScores([5,5,5,5,5], [5,5,5,5,5]),
  OTIMO_ALTO:    buildScores([5,5,4,4,5], [5,5,4,5,4]),
  OTIMO_MEDIO:   buildScores([5,4,4,4,4], [4,5,4,4,4]),
  OTIMO_BAIXO:   buildScores([4,5,4,4,4], [4,4,5,4,4]),
  BOM_ALTO:      buildScores([4,4,4,4,4], [4,4,4,4,4]),
  BOM_MEDIO:     buildScores([4,4,3,3,4], [4,4,3,4,3]),
  BOM_BAIXO:     buildScores([3,4,3,3,4], [3,4,3,3,3]),
  REGULAR_ALTO:  buildScores([3,3,3,3,3], [3,3,3,3,3]),
  REGULAR_MEDIO: buildScores([3,3,2,3,3], [3,2,3,2,3]),
  REGULAR_BAIXO: buildScores([2,3,2,3,2], [2,3,2,2,3]),
  CRITICO_ALTO:  buildScores([2,2,1,2,2], [2,1,2,2,1]),
  CRITICO_BAIXO: buildScores([2,1,2,1,2], [2,2,1,1,2]),
};

type ProfileKey = keyof typeof PROFILES;

type EvalSpec = {
  technician: string;
  evaluator:  string;
  cycle:      string;
  createdAt:  Date;
  profile:    ProfileKey;
  recommendation?: Recommendation;
  observations?:   string;
};

// ─── Avaliações de Maio/2026 — 16 de 20 técnicos ─────────────────────────────
// Hoje é 2026-05-04. Datas distribuídas entre 01 e 04 de maio.
// Continuam os arcos narrativos do seed principal.

const MAY_EVALS: EvalSpec[] = [

  // ── DESTAQUES (OTIMO) ──────────────────────────────────────────────────────
  { technician: 'Mateus Costa', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T10:30:00Z'), profile: 'OTIMO_MAX',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: promoção para Tech Lead aprovada pela diretoria. Mantém nota máxima e referência absoluta.' },

  { technician: 'Isabela Martins', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T14:00:00Z'), profile: 'OTIMO_MAX',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: assumiu liderança formal do capítulo de Design. Nota máxima sustentada.' },

  { technician: 'Thiago Alves', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-03T09:15:00Z'), profile: 'OTIMO_ALTO',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: liderança do projeto de migração para Vite concluída sem regressões. Promoção a Tech Lead Front-end em análise final.' },

  { technician: 'João Pinto', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-05-01T16:00:00Z'), profile: 'OTIMO_ALTO',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: efetivado como Tech Lead Back-end. Já mentora 4 desenvolvedores ativamente.' },

  { technician: 'Marina Gomes', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-03T11:00:00Z'), profile: 'OTIMO_MEDIO',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: promoção para Sênior aprovada. Atua como referência informal em qualidade de código no time.' },

  { technician: 'Amanda Souza', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-05-04T10:00:00Z'), profile: 'OTIMO_MEDIO',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: promoção para Sênior em revisão final. Liderança em UX consolidada no Q2.' },

  { technician: 'Beatriz Lima', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-05-04T14:30:00Z'), profile: 'OTIMO_BAIXO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: spike de microserviços aprovado, projeto seguirá no Q3. Elegível para bônus de performance.' },

  // ── BOM ────────────────────────────────────────────────────────────────────
  { technician: 'Lucas Andrade', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T15:30:00Z'), profile: 'BOM_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: consolidou-se no nível BOM_ALTO. Indicação para promoção será reavaliada no fechamento do Q2.' },

  { technician: 'Gabriel Morais', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-03T13:00:00Z'), profile: 'BOM_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: terceiro ciclo consecutivo de evolução. Já é tratado como pleno apesar do tempo de casa.' },

  { technician: 'Larissa Dias', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-01T11:30:00Z'), profile: 'BOM_MEDIO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: jornada de recuperação reconhecida formalmente. Mentora informal de uma nova contratação.' },

  { technician: 'Alexandre Nunes', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-04T09:00:00Z'), profile: 'BOM_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: nova automação proposta economizou mais 2h/semana. Reeleito colaborador do mês pelo time.' },

  // ── REGULAR ────────────────────────────────────────────────────────────────
  { technician: 'Felipe Rezende', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-01T14:00:00Z'), profile: 'REGULAR_ALTO',
    recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Maio: PDI continua, leve melhora em comprometimento. Próximo checkpoint no fim de maio definirá continuidade.' },

  { technician: 'Rodrigo Fernandes', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T16:30:00Z'), profile: 'REGULAR_ALTO',
    recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Maio: primeira reunião de PDI realizada. Carga reduzida para 70% temporariamente. Acompanhamento quinzenal.' },

  { technician: 'Camila Torres', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-05-03T15:00:00Z'), profile: 'REGULAR_BAIXO',
    recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Maio: estabilizou em REGULAR_BAIXO sem recuar. PDI prorrogado por mais 60 dias com nova mentoria.' },

  { technician: 'Sofia Barbosa', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-04T11:30:00Z'), profile: 'REGULAR_ALTO',
    observations: 'Maio: trajetória de recuperação se mantém estável. PDI próximo da conclusão formal.' },

  // ── CRITICO ────────────────────────────────────────────────────────────────
  { technician: 'Daniel Ferreira', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-01T17:00:00Z'), profile: 'CRITICO_ALTO',
    recommendation: 'ATENCAO_URGENTE',
    observations: 'Maio: regrediu após melhora pontual em abril. Reunião com RH agendada. Decisão sobre continuidade até fim do Q2.' },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seed-may] Populando avaliações de Maio/2026...\n');

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const technicians = await prisma.technician.findMany({ select: { id: true, name: true } });

  const userByName = new Map(users.map(u => [u.name, u.id]));
  const techByName = new Map(technicians.map(t => [t.name, t.id]));

  let created = 0;
  let skipped = 0;

  for (const spec of MAY_EVALS) {
    const technicianId = techByName.get(spec.technician);
    const evaluatorId  = userByName.get(spec.evaluator);

    if (!technicianId || !evaluatorId) {
      console.warn(`[seed-may] WARN: referência inválida — ${spec.technician} / ${spec.evaluator}`);
      continue;
    }

    // Idempotência: pula se já existe avaliação deste técnico em maio/2026
    const existing = await prisma.evaluation.findFirst({
      where: {
        technicianId,
        createdAt: {
          gte: new Date('2026-05-01T00:00:00Z'),
          lt:  new Date('2026-06-01T00:00:00Z'),
        },
      },
      select: { id: true },
    });
    if (existing) { skipped++; continue; }

    const calc   = calculateScores(PROFILES[spec.profile]);
    const scores = PROFILES[spec.profile];

    await prisma.evaluation.create({
      data: {
        technicianId,
        evaluatorId,
        cycle:           spec.cycle,
        createdAt:       spec.createdAt,
        technicalScore:  calc.technicalScore,
        behavioralScore: calc.behavioralScore,
        finalScore:      calc.finalScore,
        classification:  calc.classification,
        recommendation:  spec.recommendation,
        observations:    spec.observations,
        scores: {
          create: scores.map(s => ({
            block:        s.block,
            criterionKey: s.criterionKey,
            score:        s.score,
            weight:       s.weight,
          })),
        },
      },
    });

    created++;
    console.log(`[seed-may] ${spec.technician.padEnd(20)} | ${calc.classification.padEnd(7)} | nota ${calc.finalScore} | ${spec.createdAt.toISOString().slice(0,10)}`);
  }

  console.log(`
[seed-may] ──────────────────────────────────────
[seed-may] ✓ Concluído!
[seed-may]   ${created} avaliações de maio criadas  (${skipped} já existiam — ignoradas)
[seed-may] ──────────────────────────────────────
  `);
}

main()
  .catch((err) => {
    console.error('[seed-may] Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
