import { PrismaClient, Recommendation } from '@prisma/client';
import { calculateScores } from '../src/utils/classification';

const prisma = new PrismaClient();

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

// ─── Avaliações de Maio/2026 — 20 colaboradores ───────────────────────────────

const MAY_EVALS: EvalSpec[] = [

  // ── DESTAQUES (OTIMO) ──────────────────────────────────────────────────────
  { technician: 'Eperson Cardoso Mayrink Xavier Filho', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T10:30:00Z'), profile: 'OTIMO_ALTO',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: promoção encaminhada. Liderou sprint de entrega crítica com nota máxima do time.' },

  { technician: 'Gustavo de Jesus Carneiro', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T14:00:00Z'), profile: 'OTIMO_MAX',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: note máxima sustentada. Assumiu liderança informal do capítulo de Design.' },

  { technician: 'Gustavo Rafael de Oliveira Iotti', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-05-03T09:15:00Z'), profile: 'OTIMO_ALTO',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: candidato a Tech Lead Front-end em avaliação final pela diretoria.' },

  { technician: 'Richard Caetano dos Santos', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-01T16:00:00Z'), profile: 'OTIMO_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: segundo ciclo no Ótimo. Documentação Swagger completa sem revisão. Elegível para bônus.' },

  { technician: 'Pedro Teodoro Varolo', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-04T11:00:00Z'), profile: 'OTIMO_ALTO',
    recommendation: 'INDICADO_PROMOCAO',
    observations: 'Maio: promoção para sênior aprovada. Passa a mentorear o time de back-end junior.' },

  { technician: 'Mário Luiz Marchetti Alves', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-04T14:30:00Z'), profile: 'OTIMO_MEDIO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: terceiro ciclo consecutivo no Ótimo. Reeleito colaborador do mês.' },

  // ── BOM ────────────────────────────────────────────────────────────────────
  { technician: 'Vanilson Lima', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T15:30:00Z'), profile: 'BOM_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: quarto ciclo em BOM_ALTO. Confiabilidade reconhecida pelo gestor.' },

  { technician: 'Alexandre Takeshi', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-03T10:00:00Z'), profile: 'OTIMO_MEDIO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: mantém Ótimo. Nova contribuição em arquitetura do módulo de relatórios.' },

  { technician: 'Kauan Carvalho dos Santos', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-03T13:00:00Z'), profile: 'BOM_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: passou a auxiliar reviews de componentes dos juniores. BOM_ALTO consolidado.' },

  { technician: 'Lucas Bueno e Silva Vigatto', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-01T11:30:00Z'), profile: 'OTIMO_MEDIO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: workshop de UX facilita comparado por ele reconhecido como melhor iniciativa do mês.' },

  { technician: 'Gabriel Marques Gallo', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-05-04T09:00:00Z'), profile: 'BOM_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: primeiro ciclo em BOM_ALTO. Jornada de melhoria reconhecida formalmente.' },

  { technician: 'Wander Gabriel de Souza Lima', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T11:00:00Z'), profile: 'BOM_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: spike de microserviços aprovado, projeto seguirá no Q3. Elegível para bônus.' },

  { technician: 'Rafael Mendes Maciel', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-05T10:00:00Z'), profile: 'BOM_ALTO',
    recommendation: 'ELEGIVEL_BONUS',
    observations: 'Maio: nova automação proposta economizou mais 2h/semana. Consistência reconhecida.' },

  { technician: 'Jéssica Laine Conde', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-05T14:00:00Z'), profile: 'BOM_ALTO',
    observations: 'Maio: terceiro ciclo em BOM_ALTO. Referência em trabalho em equipe.' },

  // ── REGULAR / PDI ──────────────────────────────────────────────────────────
  { technician: 'Caio Henrique Queiroz dos Santos', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-01T14:00:00Z'), profile: 'REGULAR_ALTO',
    recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Maio: PDI em andamento. Leve melhora em comprometimento. Próximo checkpoint ao fim de maio.' },

  { technician: 'Luiz Gustavo Roberto Romanini', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-05-02T16:30:00Z'), profile: 'REGULAR_MEDIO',
    recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Maio: primeira reunião de PDI realizada. Carga reduzida temporariamente. Acompanhamento quinzenal.' },

  { technician: 'Luis Otávio Borba', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-05-03T15:00:00Z'), profile: 'REGULAR_ALTO',
    recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Maio: estabilizou em REGULAR sem recuar. PDI prorrogado por 60 dias com nova mentoria.' },

  { technician: 'Matheus de Lima Benini', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-04T11:30:00Z'), profile: 'REGULAR_ALTO',
    recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Maio: PDI próximo da conclusão formal. Trajetória de melhora mantida.' },

  // ── CRITICO ────────────────────────────────────────────────────────────────
  { technician: 'Giovanni Rosa Marcomini', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-05-01T17:00:00Z'), profile: 'CRITICO_ALTO',
    recommendation: 'ATENCAO_URGENTE',
    observations: 'Maio: regrediu após melhora pontual em abril. Reunião com RH agendada. Decisão sobre continuidade até fim do Q2.' },

  { technician: 'Victor Zanfelice', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-05-05T09:00:00Z'), profile: 'REGULAR_MEDIO',
    recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Maio: sem avanço no PDI. Reunião trilateral (colaborador, gestor, RH) agendada para a próxima semana.' },
];

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
    console.log(`[seed-may] ${spec.technician.padEnd(42)} | ${calc.classification.padEnd(7)} | ${calc.finalScore}`);
  }

  console.log(`
[seed-may] ──────────────────────────────────────
[seed-may] ✓ Concluído!
[seed-may]   ${created} avaliações criadas  (${skipped} já existiam — ignoradas)
[seed-may] ──────────────────────────────────────
  `);
}

main()
  .catch((err) => {
    console.error('[seed-may] Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
