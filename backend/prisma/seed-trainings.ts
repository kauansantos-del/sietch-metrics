// Seed de treinamentos — popula catálogo com dados realistas.
// Roda com: npx tsx prisma/seed-trainings.ts

import { ModuleType, PrismaClient, TrainingCategory } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedModule {
  type: ModuleType;
  title: string;
  description?: string;
  durationMin: number;
  payload: unknown;
}

interface SeedTraining {
  title: string;
  description: string;
  category: TrainingCategory;
  tags: string[];
  isMandatory: boolean;
  deadlineDays?: number;
  passingScore?: number;
  hasCertificate?: boolean;
  policyRef?: string;
  modules: SeedModule[];
}

const TRAININGS: SeedTraining[] = [
  {
    title: 'Fundamentos de Cyber Security',
    description: 'Phishing, engenharia social, senhas seguras, 2FA, dispositivos e boas práticas de segurança no dia a dia.',
    category: TrainingCategory.CYBER_SECURITY,
    tags: ['segurança', 'phishing', '2FA'],
    isMandatory: true,
    deadlineDays: 30,
    passingScore: 70,
    hasCertificate: true,
    policyRef: 'A-01',
    modules: [
      {
        type: ModuleType.VIDEO,
        title: 'Introdução à Cyber Security',
        durationMin: 15,
        payload: {
          provider: 'youtube',
          source: { video_id: 'inWWhr5tnEA', url: 'https://youtube.com/watch?v=inWWhr5tnEA' },
          allow_speed: true,
          min_watch_pct: 90,
        },
      },
      {
        type: ModuleType.ARTICLE,
        title: 'OWASP Top 10',
        durationMin: 20,
        payload: {
          content_md: '# OWASP Top 10\n\nAs 10 principais vulnerabilidades em aplicações web segundo a OWASP Foundation.\n\n## 1. Broken Access Control\nFalhas na aplicação de restrições de acesso...\n\n## 2. Cryptographic Failures\nUso indevido de criptografia, dados expostos...\n\n## 3. Injection\nSQL, NoSQL, OS, LDAP injection...\n\n[Documentação completa](https://owasp.org/Top10/)',
          attachments: [],
          external_link: 'https://owasp.org/Top10/',
        },
      },
      {
        type: ModuleType.VIDEO,
        title: 'Casos reais: ataques a fintechs',
        durationMin: 22,
        payload: {
          provider: 'youtube',
          source: { video_id: 'PqEt2KWtVPo', url: 'https://youtube.com/watch?v=PqEt2KWtVPo' },
          allow_speed: true,
          min_watch_pct: 90,
        },
      },
      {
        type: ModuleType.QUIZ,
        title: 'Verificação de conhecimentos',
        durationMin: 20,
        payload: {
          passing_score: 70,
          max_attempts: 3,
          shuffle_questions: true,
          show_correct_answers: 'after_pass',
          questions: [
            {
              id: 'q1',
              kind: 'single',
              statement: 'Qual é o ataque que tenta injetar código malicioso em consultas ao banco?',
              options: [
                { id: 'a', text: 'XSS', correct: false },
                { id: 'b', text: 'SQL Injection', correct: true },
                { id: 'c', text: 'CSRF', correct: false },
                { id: 'd', text: 'Clickjacking', correct: false },
              ],
              weight: 2,
              explanation: 'SQL Injection injeta comandos SQL maliciosos em campos de entrada.',
            },
            {
              id: 'q2',
              kind: 'multiple',
              statement: 'Quais são boas práticas para senhas? (marque todas)',
              options: [
                { id: 'a', text: 'Usar 2FA quando disponível', correct: true },
                { id: 'b', text: 'Reusar a mesma senha em vários sistemas', correct: false },
                { id: 'c', text: 'Usar gerenciador de senhas', correct: true },
                { id: 'd', text: 'Trocar senha quando houver suspeita de comprometimento', correct: true },
              ],
              weight: 2,
              explanation: 'Reuso de senhas é o principal vetor de credential stuffing.',
            },
            {
              id: 'q3',
              kind: 'true_false',
              statement: 'Phishing geralmente cria senso de urgência para forçar ação rápida.',
              options: [
                { id: 'a', text: 'Verdadeiro', correct: true },
                { id: 'b', text: 'Falso', correct: false },
              ],
              weight: 1,
            },
          ],
        },
      },
      {
        type: ModuleType.TASK,
        title: 'Análise de código: vulnerabilidades',
        durationMin: 30,
        payload: {
          statement_md: '## Análise de código\n\nAnalise os 3 trechos abaixo e identifique:\n1. A vulnerabilidade presente\n2. O risco para o negócio\n3. Como corrigir tecnicamente\n\n```js\n// Trecho 1\nconst q = `SELECT * FROM payments WHERE id = ${req.query.id}`;\ndb.query(q);\n```\n\n```js\n// Trecho 2\nconst PASSWORD = "admin123";\nres.cookie("session", token);\n```\n\n```js\n// Trecho 3\nres.send(`<h1>Olá, ${req.query.name}!</h1>`);\n```',
          submission_kind: 'text',
          acceptance_criteria: [
            { id: 'c1', text: 'Identificou a vulnerabilidade em cada trecho com o nome correto' },
            { id: 'c2', text: 'Indicou o risco para negócio/dados' },
            { id: 'c3', text: 'Indicou correção técnica completa' },
          ],
          auto_complete: false,
          reviewer_role: 'admin',
        },
      },
      {
        type: ModuleType.POLICY,
        title: 'Aceite — Política de Segurança A-01',
        durationMin: 8,
        payload: {
          policy_ref: 'A-01',
          policy_version: '2.1',
          effective_date: '2026-01-15',
          content_md: '# Política de Segurança da Informação — A-01\n\n## Escopo\nEsta política aplica-se a todos os colaboradores, prestadores e terceiros que acessam recursos de TI da empresa.\n\n## Diretrizes\n1. Senhas devem ter no mínimo 12 caracteres\n2. 2FA obrigatório em sistemas críticos\n3. Incidentes devem ser reportados em até 4h\n4. Dados pessoais devem ser criptografados em trânsito e em repouso\n5. Devices corporativos requerem MDM\n\n## Sanções\nDescumprimento pode resultar em ações disciplinares conforme política interna.',
          require_full_scroll: true,
          accept_label: 'Li e concordo com o A-01 — versão 2.1, vigente desde 2026-01-15',
        },
      },
    ],
  },
  {
    title: 'PLD/FT — Prevenção à Lavagem de Dinheiro',
    description: 'Treinamento obrigatório sobre prevenção à lavagem de dinheiro e financiamento ao terrorismo. Essencial para conformidade regulatória Banco Central.',
    category: TrainingCategory.COMPLIANCE,
    tags: ['compliance', 'pld', 'regulatório'],
    isMandatory: true,
    deadlineDays: 45,
    hasCertificate: true,
    policyRef: 'DOC-005',
    modules: [
      {
        type: ModuleType.VIDEO,
        title: 'Introdução à PLD/FT',
        durationMin: 20,
        payload: { provider: 'youtube', source: { video_id: 'inWWhr5tnEA', url: 'https://youtube.com/watch?v=inWWhr5tnEA' }, allow_speed: true, min_watch_pct: 90 },
      },
      {
        type: ModuleType.ARTICLE,
        title: 'Marco regulatório',
        durationMin: 25,
        payload: { content_md: '# Marco Regulatório\n\nLei 9.613/1998, Circular BCB 3.978/2020...\n\nFases da lavagem:\n- Colocação\n- Ocultação\n- Integração', attachments: [] },
      },
      {
        type: ModuleType.QUIZ,
        title: 'Avaliação final',
        durationMin: 30,
        payload: {
          passing_score: 75,
          max_attempts: 2,
          shuffle_questions: false,
          show_correct_answers: 'after_pass',
          questions: [
            { id: 'q1', kind: 'single', statement: 'Qual a fase da lavagem em que o dinheiro entra no sistema financeiro?', options: [{ id: 'a', text: 'Colocação', correct: true }, { id: 'b', text: 'Ocultação', correct: false }, { id: 'c', text: 'Integração', correct: false }], weight: 1 },
            { id: 'q2', kind: 'true_false', statement: 'A comunicação de operação suspeita ao COAF é obrigatória.', options: [{ id: 'a', text: 'Verdadeiro', correct: true }, { id: 'b', text: 'Falso', correct: false }], weight: 1 },
            { id: 'q3', kind: 'single', statement: 'Quem é o órgão regulador máximo de PLD no Brasil?', options: [{ id: 'a', text: 'CVM', correct: false }, { id: 'b', text: 'COAF', correct: true }, { id: 'c', text: 'CADE', correct: false }], weight: 1 },
          ],
        },
      },
      {
        type: ModuleType.POLICY,
        title: 'Aceite — Política DOC-005',
        durationMin: 10,
        payload: {
          policy_ref: 'DOC-005',
          policy_version: '1.4',
          effective_date: '2025-09-01',
          content_md: '# Política DOC-005 — PLD/FT\n\n## Diretrizes\n1. KYC obrigatório para todos os clientes\n2. Monitoramento contínuo de transações\n3. Reporte ao COAF em até 24h após detecção',
          accept_label: 'Li e concordo com a DOC-005 v1.4',
        },
      },
    ],
  },
  {
    title: 'Código de Ética e Conduta',
    description: 'Valores, princípios e condutas esperadas de todos os colaboradores. Inclui aceite digital com timestamp auditável.',
    category: TrainingCategory.COMPLIANCE,
    tags: ['ética', 'conduta', 'cultura'],
    isMandatory: true,
    deadlineDays: 14,
    policyRef: 'DOC-001',
    modules: [
      {
        type: ModuleType.ARTICLE,
        title: 'Os 5 princípios fundamentais',
        durationMin: 30,
        payload: { content_md: '# Código de Ética\n\n## Princípios\n1. Integridade\n2. Respeito\n3. Transparência\n4. Responsabilidade\n5. Excelência', attachments: [] },
      },
      {
        type: ModuleType.POLICY,
        title: 'Aceite formal',
        durationMin: 5,
        payload: {
          policy_ref: 'DOC-001',
          policy_version: '3.0',
          effective_date: '2026-01-01',
          content_md: '# Código de Ética e Conduta v3.0\n\nDeclaração de compromisso com os 5 princípios fundamentais...',
          accept_label: 'Li e concordo com o Código de Ética v3.0',
        },
      },
    ],
  },
  {
    title: 'React & TypeScript Avançado',
    description: 'Padrões avançados, performance, testing e arquitetura de componentes em aplicações React enterprise.',
    category: TrainingCategory.DEV_FRONTEND,
    tags: ['react', 'typescript', 'frontend'],
    isMandatory: false,
    deadlineDays: 90,
    modules: [
      {
        type: ModuleType.VIDEO,
        title: 'React Patterns',
        durationMin: 45,
        payload: { provider: 'youtube', source: { video_id: 'YaZg8wg39QQ', url: 'https://youtube.com/watch?v=YaZg8wg39QQ' }, allow_speed: true, min_watch_pct: 85 },
      },
      {
        type: ModuleType.ARTICLE,
        title: 'TypeScript em escala',
        durationMin: 30,
        payload: { content_md: '# TypeScript Avançado\n\n## Generics, conditional types, mapped types...', attachments: [] },
      },
      {
        type: ModuleType.TASK,
        title: 'Refatoração de componente legado',
        durationMin: 60,
        payload: {
          statement_md: '## Refatoração\n\nPegue um componente legado do projeto e refatore aplicando os padrões aprendidos.\n\nSubmeta o link do PR.',
          submission_kind: 'link',
          acceptance_criteria: [
            { id: 'c1', text: 'Reduziu prop drilling' },
            { id: 'c2', text: 'Tipos estritos sem any' },
            { id: 'c3', text: 'Testes adicionados' },
          ],
          auto_complete: false,
          reviewer_role: 'admin',
        },
      },
    ],
  },
  {
    title: 'Design System e UX Research',
    description: 'Criação e manutenção de design systems, testes com usuários, heurísticas de Nielsen e fundamentos de UX.',
    category: TrainingCategory.OUTROS,
    tags: ['design', 'ux', 'research'],
    isMandatory: false,
    deadlineDays: 60,
    modules: [
      {
        type: ModuleType.VIDEO,
        title: 'Heurísticas de Nielsen',
        durationMin: 40,
        payload: { provider: 'youtube', source: { video_id: 'hWc0Fd2AS3Y', url: 'https://youtube.com/watch?v=hWc0Fd2AS3Y' }, allow_speed: true, min_watch_pct: 85 },
      },
      {
        type: ModuleType.TASK,
        title: 'Avaliação heurística do produto',
        durationMin: 90,
        payload: {
          statement_md: '## Avaliação\n\nEscolha um fluxo do sistema e faça uma avaliação heurística usando as 10 heurísticas de Nielsen. Documente 3 problemas com proposta de melhoria.',
          submission_kind: 'text',
          acceptance_criteria: [
            { id: 'c1', text: '3 problemas com heurística mapeada' },
            { id: 'c2', text: 'Proposta concreta para cada' },
            { id: 'c3', text: 'Priorização por impacto' },
          ],
          reviewer_role: 'admin',
        },
      },
    ],
  },
];

async function main() {
  const author = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!author) {
    console.error('Sem SUPER_ADMIN no banco. Rode primeiro o seed principal.');
    process.exit(1);
  }

  console.log(`[seed-trainings] Autor: ${author.name} (${author.email})\n`);

  let created = 0;

  for (const t of TRAININGS) {
    const existing = await prisma.training.findFirst({ where: { title: t.title } });
    if (existing) {
      console.log(`[skip] ${t.title} já existe`);
      continue;
    }

    const training = await prisma.training.create({
      data: {
        title: t.title,
        description: t.description,
        category: t.category,
        tags: t.tags,
        isMandatory: t.isMandatory,
        deadlineDays: t.deadlineDays ?? null,
        passingScore: t.passingScore ?? 70,
        hasCertificate: t.hasCertificate ?? false,
        policyRef: t.policyRef ?? null,
        authorId: author.id,
        status: 'PUBLISHED',
        currentVersion: '1.0',
        publishedAt: new Date(),
      },
    });

    let order = 0;
    for (const m of t.modules) {
      await prisma.module.create({
        data: {
          trainingId: training.id,
          orderIndex: order++,
          type: m.type,
          title: m.title,
          description: m.description ?? null,
          durationMin: m.durationMin,
          isRequired: true,
          payload: m.payload as never,
        },
      });
    }

    // Cria versão imutável
    const modulesSnap = await prisma.module.findMany({
      where: { trainingId: training.id },
      orderBy: { orderIndex: 'asc' },
    });

    await prisma.trainingVersion.create({
      data: {
        trainingId: training.id,
        version: '1.0',
        publishedBy: author.id,
        snapshot: {
          training: {
            id: training.id,
            title: training.title,
            description: training.description,
            category: training.category,
            tags: training.tags,
            isMandatory: training.isMandatory,
            deadlineDays: training.deadlineDays,
            passingScore: training.passingScore,
            hasCertificate: training.hasCertificate,
          },
          modules: modulesSnap,
        } as never,
      },
    });

    console.log(`[ok]   ${t.title} (${t.modules.length} módulos)`);
    created++;
  }

  console.log(`\n[seed-trainings] ✓ ${created} treinamentos criados.`);

  // Cria assignments para cada admin user, pra ter dados visíveis
  const admins = await prisma.user.findMany({ where: { active: true } });
  const trainings = await prisma.training.findMany({
    where: { status: 'PUBLISHED' },
    include: { versions: { orderBy: { publishedAt: 'desc' }, take: 1 } },
  });

  let assigned = 0;
  for (const user of admins) {
    for (const t of trainings) {
      if (!t.versions[0]) continue;
      const exists = await prisma.assignment.findUnique({
        where: {
          userId_trainingId_trainingVersionId: {
            userId: user.id,
            trainingId: t.id,
            trainingVersionId: t.versions[0].id,
          },
        },
      });
      if (exists) continue;

      const dueAt = t.deadlineDays
        ? new Date(Date.now() + t.deadlineDays * 24 * 60 * 60 * 1000)
        : null;

      await prisma.assignment.create({
        data: {
          userId: user.id,
          trainingId: t.id,
          trainingVersionId: t.versions[0].id,
          assignedBy: author.id,
          dueAt,
          status: 'NOT_STARTED',
        },
      });
      assigned++;
    }
  }

  console.log(`[seed-trainings] ✓ ${assigned} atribuições criadas.\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
