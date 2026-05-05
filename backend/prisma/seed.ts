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

const USERS_DATA = [
  { name: 'Ana Lima',         email: 'ana.lima@sietch.tech',         googleId: 'seed_gid_001', role: 'SUPER_ADMIN' as const },
  { name: 'Carlos Mendes',    email: 'carlos.mendes@sietch.tech',    googleId: 'seed_gid_002', role: 'ADMIN'       as const },
  { name: 'Juliana Ferreira', email: 'juliana.ferreira@sietch.tech', googleId: 'seed_gid_003', role: 'ADMIN'       as const },
  { name: 'Roberto Nunes',    email: 'roberto.nunes@sietch.tech',    googleId: 'seed_gid_004', role: 'ADMIN'       as const },
];

const TECHNICIANS_DATA = [
  // Dev (7)
  { name: 'Eperson Cardoso Mayrink Xavier Filho', email: 'eperson.xavier@sietch.tech',    team: 'Dev'       },
  { name: 'Vanilson Lima',                        email: 'vanilson.lima@sietch.tech',     team: 'Dev'       },
  { name: 'Leandro Lamanna Zanardi',              email: 'leandro.zanardi@sietch.tech',   team: 'Dev'       },
  { name: 'João Victor Batista',                  email: 'joao.batista@sietch.tech',      team: 'Dev'       },
  { name: 'Alexandre Takeshi',                    email: 'alexandre.takeshi@sietch.tech', team: 'Dev'       },
  { name: 'Ana Paula Gonçalves Floriano',         email: 'ana.floriano@sietch.tech',      team: 'Dev'       },
  { name: 'Caio Henrique Queiroz dos Santos',     email: 'caio.santos@sietch.tech',       team: 'Dev'       },
  // Design (7)
  { name: 'Carlos Eduardo Schio Campos da Silva', email: 'carlos.silva@sietch.tech',      team: 'Design'    },
  { name: 'Gustavo de Jesus Carneiro',            email: 'gustavo.carneiro@sietch.tech',  team: 'Design'    },
  { name: 'Denis Aparecido Rodrigues de Oliveira',email: 'denis.oliveira@sietch.tech',    team: 'Design'    },
  { name: 'Kauan Carvalho dos Santos',            email: 'kauan.santos@sietch.tech',      team: 'Design'    },
  { name: 'Rodolfo Pereira de Borba',             email: 'rodolfo.borba@sietch.tech',     team: 'Design'    },
  { name: 'Lucas Bueno e Silva Vigatto',          email: 'lucas.vigatto@sietch.tech',     team: 'Design'    },
  { name: 'Henrique Turazzi Casas Freile',        email: 'henrique.freile@sietch.tech',   team: 'Design'    },
  // Front-end (7)
  { name: 'Gustavo Rafael de Oliveira Iotti',     email: 'gustavo.iotti@sietch.tech',     team: 'Front-end' },
  { name: 'Gabriel Marques Gallo',                email: 'gabriel.gallo@sietch.tech',     team: 'Front-end' },
  { name: 'Erica Rocha Amaral',                   email: 'erica.amaral@sietch.tech',      team: 'Front-end' },
  { name: 'Luis Otávio Borba',                    email: 'luis.borba@sietch.tech',        team: 'Front-end' },
  { name: 'Vinicius Ribeiro Macedo Deotti',       email: 'vinicius.deotti@sietch.tech',   team: 'Front-end' },
  { name: 'Joabe Granvile Soares',                email: 'joabe.soares@sietch.tech',      team: 'Front-end' },
  { name: 'Luiz Gustavo Roberto Romanini',        email: 'luiz.romanini@sietch.tech',     team: 'Front-end' },
  // Back-end (7)
  { name: 'Richard Caetano dos Santos',           email: 'richard.santos@sietch.tech',    team: 'Back-end'  },
  { name: 'Wendell Harley de Souza Júnior',       email: 'wendell.junior@sietch.tech',    team: 'Back-end'  },
  { name: 'Wander Gabriel de Souza Lima',         email: 'wander.lima@sietch.tech',       team: 'Back-end'  },
  { name: 'Marcos Roberto Morato',                email: 'marcos.morato@sietch.tech',     team: 'Back-end'  },
  { name: 'Pedro Teodoro Varolo',                 email: 'pedro.varolo@sietch.tech',      team: 'Back-end'  },
  { name: 'Daniela Inforzato Butolo',             email: 'daniela.butolo@sietch.tech',    team: 'Back-end'  },
  { name: 'Giovanni Rosa Marcomini',              email: 'giovanni.marcomini@sietch.tech',team: 'Back-end'  },
  // Outros (7)
  { name: 'Rafael Mendes Maciel',                 email: 'rafael.maciel@sietch.tech',     team: 'Outros'    },
  { name: 'Mário Luiz Marchetti Alves',           email: 'mario.alves@sietch.tech',       team: 'Outros'    },
  { name: 'Jéssica Laine Conde',                  email: 'jessica.conde@sietch.tech',     team: 'Outros'    },
  { name: 'Matheus de Lima Benini',               email: 'matheus.benini@sietch.tech',    team: 'Outros'    },
  { name: 'Pedro Araujo Oliveira Brasil',         email: 'pedro.brasil@sietch.tech',      team: 'Outros'    },
  { name: 'Patrick Alves Faciroli',               email: 'patrick.faciroli@sietch.tech',  team: 'Outros'    },
  { name: 'Victor Zanfelice',                     email: 'victor.zanfelice@sietch.tech',  team: 'Outros'    },
];

type EvalSpec = {
  technician: string;
  evaluator:  string;
  cycle:      string;
  createdAt:  Date;
  profile:    ProfileKey;
  recommendation?: Recommendation;
  observations?:   string;
};

// ─── 70 avaliações — 2 ciclos por colaborador (Q1 e Q2 / 2026) ───────────────

const EVAL_SPECS: EvalSpec[] = [

  // ── Dev — avaliador: Ana Lima ─────────────────────────────────────────────

  { technician: 'Eperson Cardoso Mayrink Xavier Filho', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-10'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Excelente desenvolvedor. Referência técnica no squad. Entregas consistentes e de alta qualidade.' },
  { technician: 'Eperson Cardoso Mayrink Xavier Filho', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-14'), profile: 'OTIMO_ALTO', recommendation: 'INDICADO_PROMOCAO',
    observations: 'Evolução notável. Liderou entrega crítica do trimestre. Candidato natural à promoção para sênior.' },

  { technician: 'Vanilson Lima', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-11'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Profissional sólido e confiável. Cumpre prazos e mantém boa relação com o time.' },
  { technician: 'Vanilson Lima', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-15'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Mantém nível BOM_ALTO. Proatividade crescente. Referência em confiabilidade para o squad.' },

  { technician: 'Leandro Lamanna Zanardi', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-12'), profile: 'BOM_BAIXO',
    observations: 'Bom desempenho. Espaço para ganho em documentação e proatividade.' },
  { technician: 'Leandro Lamanna Zanardi', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-16'), profile: 'BOM_MEDIO',
    observations: 'Melhora perceptível na documentação e na iniciativa. Evolução consistente.' },

  { technician: 'João Victor Batista', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-13'), profile: 'REGULAR_ALTO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Dificuldades em boas práticas e ritmo de entrega. PDI iniciado com foco em qualidade técnica.' },
  { technician: 'João Victor Batista', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-17'), profile: 'BOM_BAIXO',
    observations: 'Entrou para o BOM pela primeira vez. Evolução após PDI. Melhora real no comprometimento.' },

  { technician: 'Alexandre Takeshi', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-14'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Forte domínio técnico. Contribuições relevantes em arquitetura do novo módulo.' },
  { technician: 'Alexandre Takeshi', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-18'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Mantém Ótimo pelo segundo ciclo. Mentoria ativa de dois juniores. Elegível para bônus.' },

  { technician: 'Ana Paula Gonçalves Floriano', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-17'), profile: 'BOM_MEDIO',
    observations: 'Boa profissional. Entregas no prazo e boa comunicação com o time.' },
  { technician: 'Ana Paula Gonçalves Floriano', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-21'), profile: 'BOM_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Manteve BOM e ganhou destaque na sprint de entrega do Q2. Elegível para bônus.' },

  { technician: 'Caio Henrique Queiroz dos Santos', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-18'), profile: 'REGULAR_MEDIO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Dificuldades em autonomia e qualidade de entrega. PDI iniciado com acompanhamento quinzenal.' },
  { technician: 'Caio Henrique Queiroz dos Santos', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-22'), profile: 'REGULAR_ALTO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Leve melhora após PDI. Continua em acompanhamento. Próximo ciclo será determinante.' },

  // ── Design — avaliador: Carlos Mendes ────────────────────────────────────

  { technician: 'Carlos Eduardo Schio Campos da Silva', evaluator: 'Carlos Mendes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-10'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Entregas de design consistentes. Boa aderência ao Design System e comunicação com devs.' },
  { technician: 'Carlos Eduardo Schio Campos da Silva', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-14'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Mantém BOM_ALTO. Liderou revisão de componentes do DS com excelência.' },

  { technician: 'Gustavo de Jesus Carneiro', evaluator: 'Carlos Mendes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-11'), profile: 'OTIMO_ALTO', recommendation: 'INDICADO_PROMOCAO',
    observations: 'Excepcional. Melhor entrega de design do semestre. Liderança natural no time.' },
  { technician: 'Gustavo de Jesus Carneiro', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-15'), profile: 'OTIMO_MAX', recommendation: 'INDICADO_PROMOCAO',
    observations: 'Nota máxima. Conduziu workshop de Design System para toda a empresa. Promoção recomendada.' },

  { technician: 'Denis Aparecido Rodrigues de Oliveira', evaluator: 'Carlos Mendes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-12'), profile: 'BOM_MEDIO',
    observations: 'Bom desempenho. Entregas no prazo com qualidade. Atenção à proatividade.' },
  { technician: 'Denis Aparecido Rodrigues de Oliveira', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-16'), profile: 'BOM_MEDIO',
    observations: 'Manteve nível BOM. Pequena melhora em iniciativa própria.' },

  { technician: 'Kauan Carvalho dos Santos', evaluator: 'Carlos Mendes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-13'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Profissional sólido. Contribuições relevantes na padronização de componentes.' },
  { technician: 'Kauan Carvalho dos Santos', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-17'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Segundo ciclo consecutivo em BOM_ALTO. Elegível para bônus.' },

  { technician: 'Rodolfo Pereira de Borba', evaluator: 'Carlos Mendes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-14'), profile: 'REGULAR_ALTO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Dificuldades na interpretação de briefings. PDI iniciado com foco em autonomia.' },
  { technician: 'Rodolfo Pereira de Borba', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-18'), profile: 'BOM_BAIXO',
    observations: 'Entrou para o BOM. Conquista expressiva. Evolução real após PDI.' },

  { technician: 'Lucas Bueno e Silva Vigatto', evaluator: 'Carlos Mendes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-17'), profile: 'OTIMO_BAIXO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Excelente trimestre. Criação de componente de onboarding foi destaque do time.' },
  { technician: 'Lucas Bueno e Silva Vigatto', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-21'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Consolidou-se no Ótimo. Referência em UX no capítulo de Design. Elegível para bônus.' },

  { technician: 'Henrique Turazzi Casas Freile', evaluator: 'Carlos Mendes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-18'), profile: 'BOM_BAIXO',
    observations: 'Bom esforço. Entregas adequadas. Atenção à documentação de decisões de design.' },
  { technician: 'Henrique Turazzi Casas Freile', evaluator: 'Carlos Mendes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-22'), profile: 'BOM_MEDIO',
    observations: 'Melhora notável em documentação e comunicação com devs. Tendência positiva.' },

  // ── Front-end — avaliador: Juliana Ferreira ───────────────────────────────

  { technician: 'Gustavo Rafael de Oliveira Iotti', evaluator: 'Juliana Ferreira', cycle: '2026-Q1',
    createdAt: new Date('2026-03-10'), profile: 'OTIMO_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Domínio técnico completo. Liderou migração de CSS legado sem regressões.' },
  { technician: 'Gustavo Rafael de Oliveira Iotti', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-04-23'), profile: 'OTIMO_ALTO', recommendation: 'INDICADO_PROMOCAO',
    observations: 'Mantém excelência. Candidato à promoção para Tech Lead Front-end. Impacto positivo em todo o time.' },

  { technician: 'Gabriel Marques Gallo', evaluator: 'Juliana Ferreira', cycle: '2026-Q1',
    createdAt: new Date('2026-03-11'), profile: 'BOM_MEDIO',
    observations: 'Bom desenvolvedor. Entregas de qualidade e boa interação com o time de design.' },
  { technician: 'Gabriel Marques Gallo', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-04-24'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Saltou para BOM_ALTO. Passou a contribuir ativamente nas code reviews. Elegível para bônus.' },

  { technician: 'Erica Rocha Amaral', evaluator: 'Juliana Ferreira', cycle: '2026-Q1',
    createdAt: new Date('2026-03-12'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Excelente qualidade de entrega. Proatividade em propor soluções antes de ser solicitada.' },
  { technician: 'Erica Rocha Amaral', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-04-25'), profile: 'OTIMO_BAIXO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Cruzou para o Ótimo pela primeira vez. Componente criado no Q2 virou padrão do time.' },

  { technician: 'Luis Otávio Borba', evaluator: 'Juliana Ferreira', cycle: '2026-Q1',
    createdAt: new Date('2026-03-13'), profile: 'REGULAR_ALTO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Dificuldades em boas práticas e autonomia. PDI iniciado com mentoria semanal.' },
  { technician: 'Luis Otávio Borba', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-04-28'), profile: 'REGULAR_ALTO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Sem avanço expressivo. Continua em PDI. Reunião de alinhamento com gestor realizada.' },

  { technician: 'Vinicius Ribeiro Macedo Deotti', evaluator: 'Juliana Ferreira', cycle: '2026-Q1',
    createdAt: new Date('2026-03-14'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Profissional de alto nível. Domínio técnico sólido e comunicação clara com stakeholders.' },
  { technician: 'Vinicius Ribeiro Macedo Deotti', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-04-29'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Mantém Ótimo pelo segundo ciclo. Referência em qualidade de código no squad.' },

  { technician: 'Joabe Granvile Soares', evaluator: 'Juliana Ferreira', cycle: '2026-Q1',
    createdAt: new Date('2026-03-17'), profile: 'BOM_BAIXO',
    observations: 'Bom desempenho. Entregas adequadas. Espaço para ganho em proatividade.' },
  { technician: 'Joabe Granvile Soares', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-04-30'), profile: 'BOM_MEDIO',
    observations: 'Evolução consistente. Maior iniciativa em propor melhorias técnicas.' },

  { technician: 'Luiz Gustavo Roberto Romanini', evaluator: 'Juliana Ferreira', cycle: '2026-Q1',
    createdAt: new Date('2026-03-18'), profile: 'REGULAR_BAIXO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Dificuldades recorrentes em qualidade e comunicação. PDI com mentoria intensiva iniciado.' },
  { technician: 'Luiz Gustavo Roberto Romanini', evaluator: 'Juliana Ferreira', cycle: '2026-Q2',
    createdAt: new Date('2026-04-29'), profile: 'REGULAR_MEDIO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Leve melhora após intervenção. Continua em PDI. Próximo ciclo decisivo para continuidade do plano.' },

  // ── Back-end — avaliador: Roberto Nunes ──────────────────────────────────

  { technician: 'Richard Caetano dos Santos', evaluator: 'Roberto Nunes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-10'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Arquitetura impecável nas APIs entregues. Documentação completa sem necessidade de revisão.' },
  { technician: 'Richard Caetano dos Santos', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-14'), profile: 'OTIMO_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Evolução expressiva. Liderou integração com sistema legado com zero incidentes pós-deploy.' },

  { technician: 'Wendell Harley de Souza Júnior', evaluator: 'Roberto Nunes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-11'), profile: 'BOM_MEDIO',
    observations: 'Boa profissional. Entregas sólidas em Node.js e bom relacionamento com o time.' },
  { technician: 'Wendell Harley de Souza Júnior', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-15'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Saltou para BOM_ALTO. Melhora notável em proatividade e iniciativa técnica.' },

  { technician: 'Wander Gabriel de Souza Lima', evaluator: 'Roberto Nunes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-12'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Profissional confiável. Redesenho da camada de cache reduziu latência em 35%.' },
  { technician: 'Wander Gabriel de Souza Lima', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-16'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Mantém BOM_ALTO. Contribuição relevante no spike de microserviços.' },

  { technician: 'Marcos Roberto Morato', evaluator: 'Roberto Nunes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-13'), profile: 'REGULAR_MEDIO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Habilidades na média. Falta de proatividade é limitador. PDI iniciado.' },
  { technician: 'Marcos Roberto Morato', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-17'), profile: 'REGULAR_ALTO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Leve melhora em comprometimento. Ainda abaixo do esperado. Continua em PDI.' },

  { technician: 'Pedro Teodoro Varolo', evaluator: 'Roberto Nunes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-14'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Excelente desenvolvedor. Entregou feature crítica com semanas de antecedência.' },
  { technician: 'Pedro Teodoro Varolo', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-18'), profile: 'OTIMO_ALTO', recommendation: 'INDICADO_PROMOCAO',
    observations: 'Evolução excepcional. Candidato natural à promoção. Já mentorou dois desenvolvedores plenos.' },

  { technician: 'Daniela Inforzato Butolo', evaluator: 'Roberto Nunes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-17'), profile: 'BOM_BAIXO',
    observations: 'Bom esforço. Entregas adequadas. Atenção à documentação e cobertura de testes.' },
  { technician: 'Daniela Inforzato Butolo', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-21'), profile: 'BOM_BAIXO',
    observations: 'Mantém nível BOM. Pequena melhora em testes unitários. Monitoramento próximo no Q3.' },

  { technician: 'Giovanni Rosa Marcomini', evaluator: 'Roberto Nunes', cycle: '2026-Q1',
    createdAt: new Date('2026-03-18'), profile: 'CRITICO_ALTO', recommendation: 'ATENCAO_URGENTE',
    observations: 'Situação crítica. Múltiplos bugs em produção e baixíssima interação com o time. Intervenção urgente iniciada.' },
  { technician: 'Giovanni Rosa Marcomini', evaluator: 'Roberto Nunes', cycle: '2026-Q2',
    createdAt: new Date('2026-04-22'), profile: 'REGULAR_BAIXO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Saiu do Crítico. Evolução real após intervenção. PDI em andamento. Frequência normalizada.' },

  // ── Outros — avaliador: Ana Lima ─────────────────────────────────────────

  { technician: 'Rafael Mendes Maciel', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-19'), profile: 'BOM_MEDIO',
    observations: 'Profissional confiável. Cumpre o esperado da função e boa relação interpessoal.' },
  { technician: 'Rafael Mendes Maciel', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-23'), profile: 'BOM_ALTO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Evolução notável. Propôs automatização que economizou 2h/semana. Elegível para bônus.' },

  { technician: 'Mário Luiz Marchetti Alves', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-20'), profile: 'OTIMO_BAIXO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Ótimo trimestre. Destaque em projeto de integração cross-team. Elegível para bônus.' },
  { technician: 'Mário Luiz Marchetti Alves', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-24'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Consolidou-se no Ótimo. Eleito colaborador do trimestre pelo próprio time.' },

  { technician: 'Jéssica Laine Conde', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-21'), profile: 'BOM_ALTO',
    observations: 'Profissional de alto nível. Entregas acima da média e ótima colaboração.' },
  { technician: 'Jéssica Laine Conde', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-25'), profile: 'BOM_ALTO',
    observations: 'Mantém BOM_ALTO pelo segundo ciclo. Consistência reconhecida pelo time.' },

  { technician: 'Matheus de Lima Benini', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-24'), profile: 'REGULAR_ALTO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Dificuldades em autonomia e entrega dentro do prazo. PDI iniciado.' },
  { technician: 'Matheus de Lima Benini', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-28'), profile: 'REGULAR_ALTO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Mantém Regular. PDI sendo cumprido com disciplina. Próxima avaliação avaliará saída do plano.' },

  { technician: 'Pedro Araujo Oliveira Brasil', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-25'), profile: 'BOM_MEDIO',
    observations: 'Bom profissional. Entregas consistentes e boa comunicação com as áreas.' },
  { technician: 'Pedro Araujo Oliveira Brasil', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-29'), profile: 'BOM_MEDIO',
    observations: 'Mantém BOM_MEDIO. Estável e confiável. Potencial para crescimento no próximo ciclo.' },

  { technician: 'Patrick Alves Faciroli', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-26'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Excelente desempenho. Proatividade exemplar e domínio técnico acima da média.' },
  { technician: 'Patrick Alves Faciroli', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-30'), profile: 'OTIMO_MEDIO', recommendation: 'ELEGIVEL_BONUS',
    observations: 'Mantém Ótimo. Dois ciclos consecutivos de alta performance. Elegível para bônus máximo.' },

  { technician: 'Victor Zanfelice', evaluator: 'Ana Lima', cycle: '2026-Q1',
    createdAt: new Date('2026-03-27'), profile: 'REGULAR_MEDIO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Dificuldades em comunicação e cumprimento de prazos. PDI com foco em responsabilidade.' },
  { technician: 'Victor Zanfelice', evaluator: 'Ana Lima', cycle: '2026-Q2',
    createdAt: new Date('2026-04-29'), profile: 'REGULAR_MEDIO', recommendation: 'PLANO_DESENVOLVIMENTO',
    observations: 'Sem avanço expressivo. PDI prorrogado. Reunião com RH agendada para início do Q3.' },
];

async function main() {
  console.log('[seed] Iniciando população do banco de dados...\n');

  const users: Record<string, string> = {};
  for (const u of USERS_DATA) {
    const user = await prisma.user.upsert({
      where:  { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, googleId: u.googleId, name: u.name, role: u.role },
      select: { id: true },
    });
    users[u.name] = user.id;
    console.log(`[seed] Usuário  : ${u.name} (${u.role})`);
  }

  const technicians: Record<string, string> = {};
  for (const t of TECHNICIANS_DATA) {
    const tech = await prisma.technician.upsert({
      where:  { email: t.email },
      update: { name: t.name, team: t.team },
      create: { name: t.name, email: t.email, team: t.team },
      select: { id: true },
    });
    technicians[t.name] = tech.id;
    console.log(`[seed] Técnico  : ${t.name} (${t.team})`);
  }

  console.log('');

  let created = 0;
  let skipped = 0;

  for (const spec of EVAL_SPECS) {
    const technicianId = technicians[spec.technician];
    const evaluatorId  = users[spec.evaluator];

    if (!technicianId || !evaluatorId) {
      console.warn(`[seed] WARN: referência inválida — ${spec.technician} / ${spec.evaluator}`);
      continue;
    }

    const existing = await prisma.evaluation.findFirst({
      where: { technicianId, cycle: spec.cycle },
      select: { id: true },
    });
    if (existing) { skipped++; continue; }

    const calc   = calculateScores(PROFILES[spec.profile]);
    const scores = PROFILES[spec.profile];

    await prisma.evaluation.create({
      data: {
        technicianId,
        evaluatorId,
        cycle:          spec.cycle,
        createdAt:      spec.createdAt,
        technicalScore: calc.technicalScore,
        behavioralScore: calc.behavioralScore,
        finalScore:     calc.finalScore,
        classification: calc.classification,
        recommendation: spec.recommendation,
        observations:   spec.observations,
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
    console.log(`[seed] Avaliação: ${spec.technician.padEnd(42)} | ${spec.cycle} | ${calc.classification.padEnd(7)} | nota ${calc.finalScore}`);
  }

  console.log(`
[seed] ──────────────────────────────────────
[seed] ✓ Concluído!
[seed]   ${Object.keys(users).length} usuários avaliadores
[seed]   ${Object.keys(technicians).length} técnicos (7 por área × 5 áreas)
[seed]   ${created} avaliações criadas  (${skipped} já existiam — ignoradas)
[seed] ──────────────────────────────────────
  `);
}

main()
  .catch((err) => {
    console.error('[seed] Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
