# Task — Progressão e histórico do colaborador

> **Contexto:** Sietch › Treinamentos › Administração › Relatórios (entrada principal) + Da minha equipe (entrada do gestor) + Meus treinamentos (entrada do colaborador)
> **Audiência:** Admin/RH (full), Gestor (escopo do time), Colaborador (próprio)
> **Status:** Spec para implementação
> **Relacionada a:** `task-criacao-treinamento.md`, `task-embed-video.md`

---

## 1. Objetivo

Permitir visualizar, para **um colaborador específico**:

1. Resumo de progressão consolidado (todos os treinamentos atribuídos).
2. Linha do tempo de atividade ("o que ele está estudando agora e o que fez").
3. **Drill-down completo** em cada treinamento: status módulo a módulo, respostas de quiz por questão e por tentativa, submissões de tarefa, aceites de política com auditoria.

Esta task **não** cobre:
- Visão agregada do time/empresa (vai em outra task de Relatórios).
- Edição/correção manual de respostas (vai em outra task).
- Exportação em PDF de certificado (já é flag em `task-criacao-treinamento.md`).

---

## 2. Pontos de entrada

| Quem | Onde | O que vê |
|---|---|---|
| Admin/RH | `Relatórios` → busca colaborador → perfil | Qualquer colaborador |
| Gestor | `Da minha equipe` → clica no colaborador | Apenas membros do próprio time (direct + indireto) |
| Colaborador | `Meus treinamentos` → "Ver meu histórico completo" | Apenas o próprio perfil |

Todos os três pontos abrem **a mesma tela** com o mesmo componente; o backend filtra acesso e o front esconde controles administrativos para quem não é admin/RH (ex: "Reatribuir", "Resetar tentativas").

---

## 3. Arquitetura da tela

```
┌───────────────────────────────────────────────────────────────────┐
│  ← Voltar    Colaborador / João Silva                  [ações]   │
├───────────────────────────────────────────────────────────────────┤
│  Header do colaborador  (avatar, nome, cargo, gestor, time)      │
│  KPIs:  ativos · concluídos · atrasados · % progresso médio       │
├───────────────────────────────────────────────────────────────────┤
│  Tabs:  [Visão geral] [Treinamentos] [Timeline] [Aceites]        │
├───────────────────────────────────────────────────────────────────┤
│  Conteúdo da tab                                                  │
└───────────────────────────────────────────────────────────────────┘
```

### 3.1 Header do colaborador

Campos: avatar, nome, e-mail, cargo, time/departamento, gestor direto, data de admissão, status (`ativo`/`afastado`/`desligado`).

Ações (visíveis conforme permissão):
- **Admin/RH:** `Atribuir treinamento`, `Reatribuir`, `Resetar tentativas`, `Exportar CSV`, `Exportar PDF`.
- **Gestor:** `Atribuir treinamento` (limitado ao catálogo permitido), `Exportar CSV`.
- **Colaborador:** `Exportar PDF` (próprio histórico).

### 3.2 KPIs (topo)

| KPI | Cálculo |
|---|---|
| Ativos | count(`assignments` com status ∈ {`não iniciado`, `em andamento`, `aguardando`}) |
| Concluídos | count(`assignments.status = concluído`) |
| Atrasados | count(`assignments.status = atrasado` ou prazo vencido sem conclusão) |
| % progresso médio | média(`assignment.progress_pct`) das atribuições ativas |
| Tempo total estudado | soma de `module_progress.time_spent_sec` |
| Nota média | média ponderada de quizzes concluídos |

---

## 4. Tab "Visão geral"

Layout em duas colunas (desktop) ou stack (mobile).

### 4.1 Coluna esquerda — Em andamento agora

Cards dos treinamentos com `status ∈ {em andamento, aguardando}`, ordenados por prazo mais próximo.

Cada card:
- Título + categoria
- Barra de progresso (`x/y módulos, z%`)
- Módulo atual em destaque (ex: `Atual: Análise de código: vulnerabilidades — Tarefa · 30 min`)
- Prazo + dias restantes (vermelho se ≤ 3 dias)
- Última atividade (`há 2 dias`)
- CTA `Ver detalhes` → abre tab Treinamentos com este expandido

### 4.2 Coluna direita — Resumo e alertas

- **Alertas:** atrasados, próximos do prazo, política com aceite pendente, quiz reprovado nas últimas 24h.
- **Estatísticas rápidas:**
  - Treinamentos obrigatórios: `5/7 concluídos`
  - Reciclagens pendentes
  - Streak de dias com atividade
- **Última atividade:** "Assistiu *Casos reais: ataques a fintechs* — há 1h"

---

## 5. Tab "Treinamentos" (drill-down — núcleo da task)

Lista de **todos** os treinamentos atribuídos ao colaborador (ativos + concluídos + arquivados + atrasados), com filtros.

### 5.1 Filtros e ordenação

Filtros:
- Status (`em andamento`, `não iniciado`, `concluído`, `atrasado`, `aguardando`)
- Categoria (Compliance, Cyber Security, etc.)
- Obrigatoriedade
- Faixa de data (atribuição / conclusão)
- Texto livre (busca por título)

Ordenação: prazo, última atividade, % progresso, nota.

### 5.2 Linha da lista (colapsada)

| Treinamento | Status | Prazo | Progresso | Nota | Tentativas | Ações |
|---|---|---|---|---|---|---|
| Fundamentos de Cyber Security | Em andamento | 20/05/2026 | `60%` (3/6) | — | — | `▸` |

Mesma estética da aba `Atribuições` (image 2), com chips coloridos consistentes:
- `Em andamento` — azul
- `Não iniciado` — cinza
- `Concluído` — verde
- `Atrasado` — vermelho
- `Aguardando` — amarelo/dourado

### 5.3 Linha expandida — detalhe módulo a módulo

Ao clicar `▸`, expande inline (não modal) e mostra todos os módulos do treinamento na ordem, com o estado de cada um:

```
▾ Fundamentos de Cyber Security
   ✅ 1. Introdução à Cyber Security              Vídeo · 15 min
        Assistido em 12/05/2026 · 15min 04s · velocidade média 1.2x
        watched_pct: 94%

   ✅ 2. OWASP Top 10                              Artigo · 20 min
        Lido em 12/05/2026 · tempo na página 18min 22s

   ✅ 3. Casos reais: ataques a fintechs           Vídeo · 22 min
        Assistido em 13/05/2026 · 22min 11s

   ⏳ 4. Verificação de conhecimentos              Quiz · 20 min
        2 tentativas · melhor nota 60% · reprovado
        [ Ver respostas ]

   ◌ 5. Análise de código: vulnerabilidades       Tarefa · 30 min
        Não iniciado

   ◌ 6. Aceite — Política de Segurança A-01       Política · 8 min
        Não iniciado
```

Cada módulo tem ícone do tipo (vídeo/artigo/quiz/tarefa/política), status visual e ação `Ver detalhes` quando há dado profundo (quiz, tarefa, política).

### 5.4 Detalhe por tipo de módulo

#### 5.4.1 Vídeo (image 3)

Painel lateral ou expandido com:
- Provider (YouTube/Vimeo/upload)
- Sessões de visualização (lista): início, fim, duração, velocidade, % assistida na sessão
- Heatmap de quais trechos foram realmente vistos (intervalos únicos da §5.2 de `task-embed-video.md`)
- `watched_pct` final
- Concluído em (timestamp)
- Captions ativadas (sim/não)

#### 5.4.2 Artigo

- Tempo gasto na página (medido por foco da aba)
- Scroll máximo atingido (%)
- Anexos baixados (lista com timestamp)
- Concluído em

#### 5.4.3 Quiz — **detalhe completo**

Visão consolidada do módulo:
- Nota mínima exigida (ex: `70%`)
- Tentativas usadas: `2 de 3`
- Melhor nota: `60%`
- Status: `reprovado` / `aprovado` / `aguardando`
- Tempo médio por tentativa

Aba **Tentativas**: lista de todas as tentativas, mais recente primeiro.

```
Tentativa 2 — 14/05/2026 às 14:32 · 18min 04s · nota 60% — reprovado
Tentativa 1 — 13/05/2026 às 10:11 · 23min 47s · nota 40% — reprovado
```

Clicar em uma tentativa expande **questão por questão**:

```
Q1. Qual das alternativas é um ataque do tipo SQL Injection?
    Resposta do colaborador:  (b) XSS via reflected payload         ❌
    Resposta correta:         (c) Injeção em parâmetro de query     
    Peso: 1 · Tempo na questão: 47s
    Explicação (se configurada): SQL Injection ocorre quando...

Q2. (Múltipla) Quais são camadas do OWASP Top 10? ...
    Respostas do colaborador: a, c    ✅ (parcial — esperado a, c, d)
    Peso: 2 · Tempo na questão: 1min 12s
```

Detalhe técnico:
- Cada questão mostra: enunciado, opções, qual foi marcada, qual é a correta, peso, tempo gasto, explicação (se houver).
- Suporta os 3 kinds (`single`, `multiple`, `true_false`).
- Para `multiple`: marcar parciais (`acertou 2 de 3 corretas`).
- Se admin/RH: opção `Anular questão` (gera evento auditável e recalcula nota).

#### 5.4.4 Tarefa prática

- Status: `pendente` / `submetida` / `em revisão` / `aprovada` / `rejeitada`
- Submissões (lista — pode haver mais de uma se rejeitada):
  - Conteúdo da submissão (texto, link ou arquivo conforme `submission_kind`)
  - Data e hora
  - Tempo da abertura do módulo até a submissão
  - Revisor (se aplicável)
  - Feedback do revisor
- Checklist de critérios de aceite com qual o revisor marcou.

Exemplo de submissão de texto (referência: image 4 — análise de código):

```
Submissão 1 — 14/05/2026 às 16:08
Tempo: 42min · Revisor: Maria (admin)
Status: aprovada com ressalvas

Resposta do colaborador:
> Trecho 1: SQL Injection clássico. Risco: vazamento da tabela payments...
> Trecho 2: Credencial hardcoded e cookie sem flags...
> Trecho 3: XSS refletido em req.query.name...

Critérios:
☑ Identificou a vulnerabilidade em cada trecho com o nome correto
☑ Indicou o risco para negócio/dados
☐ Indicou correção técnica completa

Feedback do revisor:
> Boa análise dos riscos. Falta detalhar a correção do trecho 2 (uso de bcrypt + JWT).
```

#### 5.4.5 Política (aceite)

- Política e versão (ex: `A-01 · versão 2.1 · vigência 2026-01-15`)
- Aceito em: timestamp
- IP, user-agent (auditoria)
- Tempo entre abrir e aceitar (anti-"aceite reflexo" — se < 10s, sinaliza com badge `revisar`)
- Conteúdo da política na versão aceita (snapshot — não muda se a política for atualizada depois)
- Histórico se houver múltiplos aceites (versões anteriores)

---

## 6. Tab "Timeline"

Linha do tempo cronológica reversa de toda a atividade do colaborador. Cada evento tem ícone do tipo, módulo, treinamento, timestamp.

```
Hoje
  14:32  ❌ Reprovou no quiz "Verificação de conhecimentos" — nota 60% (tentativa 2)
  14:14  ▶  Iniciou tentativa 2 de "Verificação de conhecimentos"
  11:02  ✅ Concluiu "Casos reais: ataques a fintechs" (22min)

Ontem
  16:08  📝 Submeteu tarefa "Análise de código: vulnerabilidades"
  ...
```

### 6.1 Tipos de evento

| Tipo | Quando dispara |
|---|---|
| `assignment.created` | Treinamento atribuído ao colaborador |
| `training.started` | Primeiro módulo aberto |
| `module.started` | Módulo aberto pela primeira vez |
| `module.completed` | Módulo marcado como concluído |
| `quiz.attempt.started` | Início de tentativa de quiz |
| `quiz.attempt.submitted` | Submissão de tentativa (com nota e aprovado/reprovado) |
| `task.submitted` | Submissão de tarefa |
| `task.reviewed` | Revisor aprovou/rejeitou |
| `policy.accepted` | Aceite de política |
| `training.completed` | Treinamento finalizado |
| `assignment.overdue` | Virou atrasado |
| `recurrence.triggered` | Disparou reciclagem anual |

### 6.2 Filtros da timeline

- Faixa de data
- Tipo de evento
- Treinamento específico
- Busca textual

### 6.3 Ordenação

Padrão: mais recente primeiro. Agrupamento visual por dia (`Hoje`, `Ontem`, `12/05/2026`).

---

## 7. Tab "Aceites" (política / compliance)

Visão dedicada para auditoria de compliance — é o que o time de Riscos vai pedir primeiro em uma fiscalização.

Tabela:

| Política | Versão | Vigência | Aceito em | IP | User-agent | Tempo de leitura | Ações |
|---|---|---|---|---|---|---|---|
| A-01 (Política de Segurança) | 2.1 | 2026-01-15 | 12/05/2026 14:33 | 187.21.x.x | Chrome 124 / Win | 4min 12s | `Ver snapshot` |
| DOC-001 (Código de Ética) | 1.4 | 2025-08-01 | 03/03/2026 09:15 | 187.21.x.x | Chrome 121 / Win | 2min 48s | `Ver snapshot` |

`Ver snapshot` abre exatamente o conteúdo que estava na tela do colaborador no momento do aceite (imutável). Referência visual: image 5.

Esta tab é a **única** que admin/RH pode exportar com selo digital (PDF assinado) para auditoria externa.

---

## 8. Modelo de dados

### 8.1 Tabelas adicionais (sobre as já definidas em `task-criacao-treinamento.md`)

```
assignments
  id                  uuid PK
  user_id             uuid FK
  training_id         uuid FK
  training_version_id uuid FK     -- "congelado" na versão atribuída
  assigned_by         uuid FK
  assigned_at         timestamptz
  due_at              timestamptz
  started_at          timestamptz
  completed_at        timestamptz
  status              enum ('not_started','in_progress','completed','overdue','waiting')
  progress_pct        numeric(5,2)
  final_score         numeric(5,2)
  UNIQUE (user_id, training_id, training_version_id)

module_progress
  id              uuid PK
  assignment_id   uuid FK
  module_id       uuid FK
  status          enum ('not_started','in_progress','completed')
  started_at      timestamptz
  completed_at    timestamptz
  time_spent_sec  int
  payload         jsonb         -- específico do tipo (ex: scroll_pct para artigo)
  UNIQUE (assignment_id, module_id)

quiz_attempts
  id              uuid PK
  module_progress_id uuid FK
  attempt_number  int
  started_at      timestamptz
  submitted_at    timestamptz
  duration_sec    int
  score_pct       numeric(5,2)
  passed          bool
  payload         jsonb         -- snapshot das questões na versão usada

quiz_answers
  id              uuid PK
  attempt_id      uuid FK
  question_id     varchar(40)
  selected_options text[]       -- ids das opções marcadas
  correct         bool
  partial_credit  numeric(5,2)
  time_spent_sec  int

task_submissions
  id              uuid PK
  module_progress_id uuid FK
  submission_number int
  submitted_at    timestamptz
  submission_kind enum ('text','file','link','none')
  content         jsonb          -- { text } | { file_url, filename } | { url }
  status          enum ('pending','approved','rejected','approved_with_notes')
  reviewer_id     uuid FK
  reviewed_at     timestamptz
  feedback        text
  criteria_checks jsonb          -- [{ id, checked: bool }]

activity_events
  id              uuid PK
  user_id         uuid FK
  type            varchar(40)
  training_id     uuid FK
  module_id       uuid FK NULL
  payload         jsonb
  occurred_at     timestamptz
  INDEX (user_id, occurred_at DESC)

-- policy_acceptances já definida em task-criacao-treinamento.md §7.1
-- video_progress já definida em task-embed-video.md §6.2
```

### 8.2 Índices recomendados

- `assignments(user_id, status)` — KPIs e filtros
- `module_progress(assignment_id)` — render do drill-down
- `quiz_attempts(module_progress_id, attempt_number)` — lista de tentativas
- `activity_events(user_id, occurred_at DESC)` — timeline
- `activity_events(user_id, type, occurred_at DESC)` — timeline filtrada
- `policy_acceptances(user_id, accepted_at DESC)` — tab aceites

### 8.3 Estratégia de retenção

- `activity_events`: manter quente 12 meses, arquivar em cold storage até 5 anos (auditoria compliance).
- `quiz_answers`: mantidas pelo tempo de vida do `assignment` + 5 anos.
- `policy_acceptances`: **imutáveis e nunca apagadas** (requisito LGPD/SOX). Mesmo se o usuário for deletado, mantém-se com `user_id` virando hash anonimizado.

---

## 9. Contrato de API

Base: `/api/v1`

### 9.1 Header e KPIs do colaborador

```http
GET /api/v1/users/{user_id}/training-summary

→ 200
{
  "user": { "id", "name", "email", "role", "team", "manager_id", "status" },
  "kpis": {
    "active": 3,
    "completed": 12,
    "overdue": 1,
    "avg_progress_pct": 62.5,
    "total_time_sec": 187420,
    "avg_score_pct": 78.4
  },
  "alerts": [
    { "kind": "overdue", "training_id": "...", "training_title": "...", "days_overdue": 4 },
    { "kind": "policy_pending", "policy_ref": "A-01" }
  ]
}
```

### 9.2 Lista de treinamentos do colaborador

```http
GET /api/v1/users/{user_id}/assignments
  ?status=in_progress,overdue
  &category=Cyber%20Security
  &q=cyber
  &sort=due_at
  &page=1&per_page=20

→ 200
{
  "items": [
    {
      "assignment_id": "uuid",
      "training_id": "uuid",
      "title": "Fundamentos de Cyber Security",
      "category": "Cyber Security",
      "is_mandatory": true,
      "status": "in_progress",
      "due_at": "2026-05-20T23:59:59Z",
      "progress_pct": 60,
      "modules_done": 3,
      "modules_total": 6,
      "current_module": { "id": "...", "type": "task", "title": "Análise de código: vulnerabilidades" },
      "last_activity_at": "2026-05-14T14:32:00Z",
      "final_score": null
    }
  ],
  "page": 1, "per_page": 20, "total": 18
}
```

### 9.3 Drill-down de um treinamento

```http
GET /api/v1/users/{user_id}/assignments/{assignment_id}

→ 200
{
  "assignment": { ... como acima ... },
  "training_version": "1.2",
  "modules": [
    {
      "module_id": "...",
      "type": "video",
      "title": "Introdução à Cyber Security",
      "order": 1,
      "status": "completed",
      "started_at": "...", "completed_at": "...",
      "time_spent_sec": 904,
      "detail": {                            // payload por tipo
        "watched_pct": 94,
        "avg_speed": 1.2,
        "sessions": [ { "start": "...", "end": "...", "watched_pct": 94 } ]
      }
    },
    {
      "module_id": "...",
      "type": "quiz",
      "title": "Verificação de conhecimentos",
      "status": "in_progress",
      "detail": {
        "passing_score": 70,
        "max_attempts": 3,
        "attempts_used": 2,
        "best_score_pct": 60,
        "passed": false
      }
    }
  ]
}
```

### 9.4 Tentativas de quiz

```http
GET /api/v1/users/{user_id}/modules/{module_id}/quiz-attempts

→ 200
{
  "attempts": [
    {
      "attempt_id": "uuid",
      "attempt_number": 2,
      "started_at": "...", "submitted_at": "...",
      "duration_sec": 1084,
      "score_pct": 60,
      "passed": false
    }
  ]
}
```

### 9.5 Detalhe de uma tentativa (com respostas por questão)

```http
GET /api/v1/users/{user_id}/quiz-attempts/{attempt_id}

→ 200
{
  "attempt": { "attempt_number": 2, "score_pct": 60, "passed": false, ... },
  "answers": [
    {
      "question_id": "q1",
      "statement": "Qual das alternativas é um ataque do tipo SQL Injection?",
      "kind": "single",
      "options": [
        { "id": "a", "text": "...", "correct": false, "selected": false },
        { "id": "b", "text": "XSS via reflected payload", "correct": false, "selected": true },
        { "id": "c", "text": "Injeção em parâmetro de query", "correct": true, "selected": false }
      ],
      "correct": false,
      "weight": 1,
      "time_spent_sec": 47,
      "explanation": "SQL Injection ocorre quando..."
    }
  ]
}
```

### 9.6 Submissões de tarefa

```http
GET /api/v1/users/{user_id}/modules/{module_id}/task-submissions

→ 200
{
  "submissions": [
    {
      "submission_id": "uuid",
      "submission_number": 1,
      "submitted_at": "...",
      "submission_kind": "text",
      "content": { "text": "Trecho 1: SQL Injection clássico..." },
      "status": "approved_with_notes",
      "reviewer": { "id": "...", "name": "Maria" },
      "reviewed_at": "...",
      "feedback": "Boa análise...",
      "criteria_checks": [
        { "id": "c1", "text": "Identificou a vulnerabilidade...", "checked": true },
        { "id": "c2", "text": "Indicou o risco...", "checked": true },
        { "id": "c3", "text": "Indicou correção técnica completa", "checked": false }
      ]
    }
  ]
}
```

### 9.7 Timeline

```http
GET /api/v1/users/{user_id}/activity
  ?from=2026-05-01&to=2026-05-15
  &types=quiz.attempt.submitted,task.submitted,policy.accepted
  &training_id=uuid
  &cursor=...
  &limit=50

→ 200
{
  "events": [
    {
      "id": "uuid",
      "type": "quiz.attempt.submitted",
      "occurred_at": "2026-05-14T14:32:00Z",
      "training": { "id": "...", "title": "Fundamentos de Cyber Security" },
      "module": { "id": "...", "title": "Verificação de conhecimentos", "type": "quiz" },
      "payload": { "attempt_number": 2, "score_pct": 60, "passed": false }
    }
  ],
  "next_cursor": "..."
}
```

### 9.8 Aceites de política

```http
GET /api/v1/users/{user_id}/policy-acceptances

→ 200
{
  "items": [
    {
      "id": "uuid",
      "policy_ref": "A-01",
      "policy_version": "2.1",
      "effective_date": "2026-01-15",
      "accepted_at": "2026-05-12T14:33:00Z",
      "ip": "187.21.x.x",
      "user_agent": "Mozilla/5.0 ... Chrome/124",
      "reading_time_sec": 252,
      "snapshot_url": "/api/v1/policy-snapshots/{id}"
    }
  ]
}
```

### 9.9 Exportações

```http
POST /api/v1/users/{user_id}/exports
{ "format": "csv" | "pdf", "scope": "summary" | "full" | "acceptances_only" }

→ 202   { "export_id": "uuid", "status": "queued" }

GET /api/v1/exports/{export_id}
→ 200   { "status": "ready", "download_url": "...", "expires_at": "..." }
```

Geração assíncrona — relatórios grandes não bloqueiam a UI.

### 9.10 Códigos de erro

| Code | HTTP | Quando |
|---|---|---|
| `USER_NOT_FOUND` | 404 | — |
| `FORBIDDEN` | 403 | Gestor tentando ver fora do time, colaborador tentando ver terceiros |
| `ASSIGNMENT_NOT_FOUND` | 404 | — |
| `EXPORT_FAILED` | 500 | — |

---

## 10. Permissões (matriz)

| Ação | Admin/RH | Gestor (do time) | Colaborador (próprio) |
|---|---|---|---|
| Ver header + KPIs | ✅ | ✅ | ✅ |
| Ver lista de treinamentos | ✅ | ✅ | ✅ |
| Ver drill-down de módulos | ✅ | ✅ | ✅ |
| Ver respostas de quiz (suas) | ✅ | ✅ | ✅ |
| Ver respostas corretas durante curso | ✅ | conforme `show_correct_answers` | conforme `show_correct_answers` |
| Ver submissões de tarefa | ✅ | ✅ | ✅ (próprias) |
| Ver feedback do revisor | ✅ | ✅ | ✅ |
| Ver IP/user-agent em aceites | ✅ | ❌ | ❌ |
| Ver tempo de leitura de política | ✅ | ✅ | ✅ |
| Exportar CSV | ✅ | ✅ (próprio time) | ❌ |
| Exportar PDF assinado (compliance) | ✅ | ❌ | ❌ |
| Resetar tentativas | ✅ | ❌ | ❌ |
| Anular questão | ✅ | ❌ | ❌ |
| Reatribuir | ✅ | ❌ | ❌ |
| Ver de outro colaborador | ✅ | só do time | só o próprio |

> Regra de gestor: hierarquia transitiva. Se Pedro reporta a Maria e Maria reporta a João, João vê Pedro. Profundidade máxima configurável (default = ilimitada).

---

## 11. Performance e cache

- Drill-down é o endpoint mais pesado. Estratégia: **agregado materializado** por `assignment_id` atualizado por evento (não calcular ao request).
- KPIs do header: cache em Redis por 60s.
- Timeline paginada com cursor — nunca offset (cresce muito).
- Exportações de >1000 linhas vão para fila (worker assíncrono).
- Heatmap de vídeo gerado lazy ao expandir o módulo, não na lista.

Metas:
- Header + lista de treinamentos: P95 < 400ms
- Drill-down de 1 assignment: P95 < 600ms
- Detalhe de 1 tentativa de quiz: P95 < 300ms
- Timeline (50 eventos): P95 < 500ms

---

## 12. UX — estados e microcopy

### 12.1 Empty states

| Cenário | Mensagem |
|---|---|
| Nenhum treinamento atribuído | "Este colaborador ainda não tem treinamentos atribuídos." + CTA `Atribuir treinamento` (se admin/gestor) |
| Filtros sem resultado | "Nenhum treinamento corresponde aos filtros aplicados." + `Limpar filtros` |
| Timeline vazia | "Nenhuma atividade no período selecionado." |
| Sem aceites | "Nenhuma política aceita até o momento." |

### 12.2 Indicadores de status

Reuso dos chips da image 2 (consistência terminológica é regra absoluta — não usar "Pendente" se outro lugar usa "Não iniciado").

### 12.3 Badges adicionais

- `Aceite reflexo` — política aceita em < 10s. Cor: amarelo. Tooltip: "Tempo de leitura muito curto. Vale revisar."
- `Tentativa final` — última tentativa permitida do quiz. Cor: laranja.
- `Reprovado` — pontuação abaixo de `passing_score` sem mais tentativas. Cor: vermelho.

---

## 13. Critérios de aceite

### Acesso e permissão
- [ ] Admin/RH acessa o perfil de qualquer colaborador da empresa.
- [ ] Gestor acessa apenas membros do seu time (direto + indireto).
- [ ] Colaborador acessa apenas o próprio perfil; URL com outro `user_id` retorna 403.
- [ ] Controles administrativos (Resetar, Anular questão) ocultos para não-admin.

### Visão geral
- [ ] KPIs do header batem com a soma dos dados detalhados (sem inconsistência).
- [ ] Card "Em andamento agora" mostra o módulo atual correto.
- [ ] Alertas de atrasado/política pendente aparecem em até 1 min após o evento.

### Drill-down
- [ ] Lista de treinamentos respeita filtros combinados (status + categoria + busca).
- [ ] Expandir um treinamento mostra todos os módulos na ordem certa com status real.
- [ ] Módulo de vídeo mostra `watched_pct` calculado por intervalos únicos (não soma).
- [ ] Módulo de quiz lista todas as tentativas (não só a melhor).
- [ ] Tentativa expandida mostra a opção marcada **e** a correta para cada questão.
- [ ] Quiz `multiple` mostra acerto parcial corretamente.
- [ ] Tarefa mostra todas as submissões em ordem cronológica + checklist marcado pelo revisor.
- [ ] Política mostra snapshot do conteúdo aceito na versão da época (não a versão atual).

### Timeline
- [ ] Eventos em ordem reversa, agrupados por dia.
- [ ] Filtro por tipo de evento funciona.
- [ ] Paginação por cursor — scroll infinito sem duplicar nem pular eventos.

### Aceites
- [ ] Tab "Aceites" lista todas as políticas aceitas com IP, user-agent, tempo de leitura.
- [ ] `Ver snapshot` abre o conteúdo exato da política na versão aceita.
- [ ] Aceite com `reading_time_sec < 10` recebe badge `Aceite reflexo`.

### Exportações
- [ ] CSV exporta com cabeçalho consistente e separador `;` (padrão pt-BR).
- [ ] PDF de compliance inclui hash do snapshot da política aceita.
- [ ] Exportação assíncrona — UI mostra status `processando` → `pronto` → link de download (válido por 24h).

### Acessibilidade
- [ ] Navegação por teclado funciona em todas as tabs.
- [ ] Chips de status têm texto, não só cor.
- [ ] Tabelas com `<th scope="col">` e leitura correta por leitor de tela.
- [ ] Drill-down expandido anuncia mudança via `aria-expanded`.

### Privacidade
- [ ] Colaborador desligado: dados acessíveis a admin/RH, mas marcados com chip `Desligado em DD/MM/AAAA`.
- [ ] Solicitação LGPD de exclusão: anonimiza `user_id` em `policy_acceptances` (não apaga o registro).

---

## 14. Edge cases e questões em aberto

1. **Colaborador trocou de time durante um treinamento** — quem é o "gestor responsável" no histórico? *Proposta:* salvar gestor no `assignment` no momento da atribuição, e o gestor atual passa a ver dali em diante.
2. **Treinamento foi atualizado (nova versão)** depois da conclusão do colaborador. Exibir a versão antiga ou a nova? *Proposta:* sempre a versão que o colaborador fez (via `training_version_id` em `assignments`).
3. **Quiz teve uma questão anulada por admin** — recalcular nota só para tentativas futuras ou retroativo? *Proposta:* retroativo, com evento auditável em `activity_events`.
4. **Tarefa rejeitada permite quantas re-submissões?** Hoje implícito = ilimitado. *Proposta:* configurável por módulo (default 3).
5. **Heatmap de vídeo de upload** depende do provider expor intervalos — confirmar se Mux/CF Stream entregam isso ou se vai ser calculado do nosso lado a partir dos ticks.
6. **Colaborador sem gestor definido** — qual o comportamento na hierarquia? *Proposta:* fallback para "RH" como gestor virtual em relatórios.
7. **Sessão de quiz interrompida** (fechou aba no meio) — conta como tentativa? *Proposta:* não conta se não houver `submitted_at`. Timeout de 24h limpa rascunho.

---

## 15. Métricas a instrumentar

- `user_profile.viewed` — { viewer_role, viewed_user_id, tab }
- `drilldown.expanded` — { assignment_id, training_id }
- `quiz_attempt.viewed` — { attempt_id, viewer_role }
- `task_submission.viewed` — { submission_id, viewer_role }
- `policy_snapshot.viewed` — { policy_ref, viewer_role }
- `export.requested` — { format, scope, viewer_role }
- Tempo médio na tela de perfil por papel (admin vs gestor vs colaborador).
- Taxa de uso da tab Timeline vs Treinamentos.
