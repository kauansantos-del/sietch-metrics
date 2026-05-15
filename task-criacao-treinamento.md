# Task — Criação de treinamento (autoria de curso)

> **Contexto:** Sietch › Treinamentos › Administração › Catálogo
> **Trigger:** botão `+ Criar treinamento` no Catálogo de treinamentos
> **Audiência:** Admin / RH / Compliance
> **Status:** Spec para implementação

---

## 1. Objetivo

Permitir que um administrador crie um treinamento completo dentro da plataforma, composto por **metadados do curso** + **N módulos de tipos heterogêneos** (vídeo, artigo, quiz, tarefa prática, política com aceite), com publicação versionada e atribuição posterior via aba `Atribuições`.

A task **não** cobre:
- Atribuição em massa a colaboradores (existe na aba `Atribuições`)
- Relatórios de conclusão (aba `Relatórios`)
- Configurações globais (aba `Configurações`)
- Player de execução do treinamento pelo aluno (task separada — ver `task-embed-video.md` para a parte de vídeo)

---

## 2. Escopo funcional

### 2.1 Fluxo macro

```
[Catálogo] → [+ Criar treinamento]
   ↓
[Etapa 1: Informações básicas]   ← metadados do curso
   ↓
[Etapa 2: Módulos]               ← builder do conteúdo (drag & drop)
   ↓
[Etapa 3: Configurações]         ← prazo, obrigatoriedade, pré-requisitos
   ↓
[Etapa 4: Revisão e publicação]  ← preview + publish/save as draft
```

O fluxo é **stepper persistente** (não-modal): cada etapa salva como rascunho automaticamente. O admin pode sair e voltar.

### 2.2 Estados do treinamento

| Estado | Descrição | Transições |
|---|---|---|
| `draft` | Em criação, não atribuível | → `published`, → `archived` |
| `published` | Disponível no catálogo, atribuível | → `draft` (nova versão), → `archived` |
| `archived` | Fora do catálogo, mantém histórico | → `published` (reativar) |

Publicar cria sempre uma **versão imutável** (`version: "1.0"`, `"1.1"`, etc). Editar um treinamento publicado gera um draft de nova versão — atribuições existentes continuam apontando para a versão antiga até serem migradas.

---

## 3. Etapa 1 — Informações básicas

### 3.1 Campos

| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| Título | string | sim | 3–80 chars |
| Descrição | text | sim | 20–500 chars |
| Categoria | enum | sim | `Compliance`, `Cyber Security`, `Pentest`, `Dev Frontend`, `Dev Backend`, `Liderança`, `Soft Skills`, `Outros` |
| Tags | string[] | não | máx 8, 2–30 chars cada |
| Capa | image | não | jpg/png/webp, ≤ 2MB, recomendado 1200×630 |
| Política vinculada | ref → policy | não | autocomplete por código (ex: `DOC-005`, `A-01`) |
| Idioma | enum | sim | default `pt-BR` |
| Autor responsável | ref → user | sim | default = usuário logado |

> **Nota de produto:** o card no Catálogo mostra `Categoria` (chip colorido), título, descrição, métricas e `Política: XXX`. Os campos acima alimentam esse card.

---

## 4. Etapa 2 — Módulos (o coração da task)

### 4.1 Tipos de módulo suportados

Cada módulo é uma entidade independente com `type`, `order`, `title`, `duration_min` + payload específico.

| `type` | Label UI | Payload principal |
|---|---|---|
| `video` | Vídeo | Provider + ID/URL, duração, transcrição opcional |
| `article` | Artigo | Markdown/rich text, anexos |
| `quiz` | Quiz / Verificação de conhecimentos | Lista de questões, nota mínima |
| `task` | Tarefa prática | Enunciado, critérios de aceite, tipo de submissão |
| `policy` | Política (aceite obrigatório) | Documento, versão, vigência, checkbox de aceite |
| `live` | Sessão ao vivo (futuro — fora desta task) | — |

### 4.2 Builder de módulos — UX

- Lista vertical reordenável (drag handle à esquerda).
- Cada item colapsado mostra: ícone do tipo, título, duração, status de validação (verde/amarelo).
- `+ Adicionar módulo` abre menu com os 5 tipos acima.
- Editor inline ao expandir (não-modal).
- Validação por módulo: módulo sem título ou sem payload mínimo aparece com aviso e bloqueia publicação.

### 4.3 Campos comuns a todos os módulos

| Campo | Tipo | Obrigatório |
|---|---|---|
| Título | string | sim |
| Duração estimada (min) | int | sim |
| Descrição curta | string | não |
| Obrigatório para conclusão | bool | sim (default `true`) |
| Ordem | int | gerado |

### 4.4 Payload por tipo

#### `video`
> **A spec completa de embed/upload está em `task-embed-video.md`. Aqui apenas os campos.**

```jsonc
{
  "type": "video",
  "provider": "youtube" | "vimeo" | "upload",
  "source": {
    // se youtube/vimeo: { "url": "...", "video_id": "..." }
    // se upload: { "asset_id": "uuid", "duration_sec": 900 }
  },
  "captions_url": "string | null",
  "transcript_md": "string | null",
  "allow_speed": true,
  "min_watch_pct": 90  // % mínima para marcar como assistido
}
```

#### `article`
```jsonc
{
  "type": "article",
  "content_md": "string",        // markdown renderizado
  "attachments": [               // anexos opcionais
    { "name": "...", "url": "...", "size_kb": 0 }
  ],
  "external_link": "string | null"
}
```

#### `quiz`
```jsonc
{
  "type": "quiz",
  "passing_score": 70,           // % mínima
  "max_attempts": 3,             // 0 = ilimitado
  "shuffle_questions": true,
  "show_correct_answers": "after_pass" | "always" | "never",
  "questions": [
    {
      "id": "q1",
      "kind": "single" | "multiple" | "true_false",
      "statement": "string",
      "options": [
        { "id": "a", "text": "string", "correct": false }
      ],
      "explanation": "string | null",
      "weight": 1
    }
  ]
}
```

Regras:
- Mínimo 3 questões para publicar.
- Soma dos pesos deve ser > 0.
- `single`/`true_false` exigem exatamente 1 opção `correct: true`.
- `multiple` exige pelo menos 1 opção `correct: true`.

#### `task` (tarefa prática)
```jsonc
{
  "type": "task",
  "statement_md": "string",            // enunciado completo
  "submission_kind": "text" | "file" | "link" | "none",
  "acceptance_criteria": [             // checklist exibido ao aluno
    { "id": "c1", "text": "string" }
  ],
  "auto_complete": false,              // se true, marca concluída ao submeter
  "reviewer_role": "manager" | "admin" | "none"
}
```

> Referência visual: o módulo `Análise de código: vulnerabilidades` na image 4 é um `task` com `submission_kind: "text"` e critérios de aceite renderizados em checklist.

#### `policy` (aceite de política)
```jsonc
{
  "type": "policy",
  "policy_ref": "A-01",                // código da política vinculada
  "policy_version": "2.1",
  "effective_date": "2026-01-15",
  "content_md": "string",              // ou render a partir do doc vinculado
  "require_full_scroll": true,         // só habilita aceite após scroll total
  "accept_label": "Li e concordo com o A-01 — versão 2.1, vigente desde 2026-01-15"
}
```

Ao aceitar:
- Gera registro auditável em `policy_acceptances` (user_id, policy_ref, version, accepted_at, ip, user_agent).
- Imutável. Nova versão = novo aceite.

---

## 5. Etapa 3 — Configurações do treinamento

| Campo | Tipo | Default | Observação |
|---|---|---|---|
| Obrigatório | bool | `false` | Aparece com chip vermelho "Obrigatório" no card |
| Prazo de conclusão (dias após atribuição) | int | `30` | Se vazio, sem prazo |
| Nota mínima geral | int (%) | `70` | Aplicada à média ponderada dos quizzes |
| Tentativas máximas no curso | int | `0` (ilimitado) | |
| Pré-requisitos | ref[] → training | `[]` | Treinamentos que devem estar `Concluído` antes |
| Reciclagem | enum + int | `never` | `never` / `annual` / `every_N_months` |
| Visibilidade | enum | `all` | `all` / `by_role` / `by_team` / `manual` |
| Certificado ao concluir | bool | `false` | Gera PDF com nome, treinamento, data, hash |
| Notificações | bool | `true` | Atribuição, lembrete (7d antes do prazo), atraso |

---

## 6. Etapa 4 — Revisão e publicação

- Preview do card como aparecerá no Catálogo.
- Preview do índice de módulos (mesma sidebar das images 3, 4, 5).
- Checklist de validação:
  - [ ] Metadados completos
  - [ ] Pelo menos 1 módulo
  - [ ] Todos os módulos válidos
  - [ ] Se tem `quiz`, tem ≥ 3 questões
  - [ ] Se tem `policy`, tem `policy_ref` válido
- Ações: `Salvar rascunho`, `Publicar`, `Publicar e atribuir agora` (atalho que abre fluxo de Atribuições já com este treinamento pré-selecionado).

---

## 7. Modelo de dados

### 7.1 Tabelas principais

```
trainings
  id              uuid PK
  title           varchar(80)
  description     text
  category        enum
  tags            text[]
  cover_url       text
  policy_ref      varchar(20)  FK → policies.code
  language        varchar(8)
  author_id       uuid FK → users.id
  status          enum ('draft','published','archived')
  current_version varchar(10)
  is_mandatory    bool
  deadline_days   int
  passing_score   int
  max_attempts    int
  visibility      enum
  has_certificate bool
  recurrence      jsonb
  created_at      timestamptz
  updated_at      timestamptz
  published_at    timestamptz

training_versions
  id              uuid PK
  training_id     uuid FK
  version         varchar(10)
  snapshot        jsonb        -- snapshot completo (módulos inclusos) imutável
  published_at    timestamptz
  published_by    uuid FK

modules
  id              uuid PK
  training_id     uuid FK
  order_index     int
  type            enum
  title           varchar(120)
  description     text
  duration_min    int
  is_required     bool
  payload         jsonb        -- payload específico do tipo
  created_at      timestamptz
  updated_at      timestamptz

prerequisites
  training_id     uuid
  required_training_id uuid
  PRIMARY KEY (training_id, required_training_id)

policy_acceptances
  id              uuid PK
  user_id         uuid FK
  policy_ref      varchar(20)
  policy_version  varchar(10)
  module_id       uuid FK
  accepted_at     timestamptz
  ip              inet
  user_agent      text
```

### 7.2 Índices recomendados

- `trainings(status, category)` — listagem do catálogo
- `modules(training_id, order_index)` — render do índice
- `policy_acceptances(user_id, policy_ref)` — auditoria

---

## 8. Contrato de API

Base: `/api/v1/admin/trainings`

### 8.1 Criar rascunho

```http
POST /api/v1/admin/trainings
Content-Type: application/json

{
  "title": "Fundamentos de Cyber Security",
  "description": "...",
  "category": "Cyber Security",
  "tags": ["segurança", "phishing"],
  "policy_ref": "A-01",
  "language": "pt-BR"
}
```

`201 Created` → retorna o objeto `Training` com `status: "draft"`.

### 8.2 Adicionar / atualizar módulo

```http
POST   /api/v1/admin/trainings/{id}/modules
PATCH  /api/v1/admin/trainings/{id}/modules/{module_id}
DELETE /api/v1/admin/trainings/{id}/modules/{module_id}

{
  "type": "quiz",
  "title": "Verificação de conhecimentos",
  "duration_min": 20,
  "is_required": true,
  "payload": { ... conforme seção 4.4 ... }
}
```

### 8.3 Reordenar módulos

```http
PUT /api/v1/admin/trainings/{id}/modules/order

{ "order": ["mod_uuid_1", "mod_uuid_3", "mod_uuid_2"] }
```

### 8.4 Validar antes de publicar

```http
POST /api/v1/admin/trainings/{id}/validate

→ 200
{
  "valid": false,
  "errors": [
    { "field": "modules[2].payload.questions", "code": "MIN_QUESTIONS", "message": "Quiz precisa ter no mínimo 3 questões." }
  ]
}
```

### 8.5 Publicar

```http
POST /api/v1/admin/trainings/{id}/publish

{ "version_bump": "minor" | "major" }
```

Cria registro em `training_versions` e muda `status` para `published`.

### 8.6 Arquivar / despublicar

```http
POST /api/v1/admin/trainings/{id}/archive
POST /api/v1/admin/trainings/{id}/unpublish    // volta a draft
```

### 8.7 Upload de capa

```http
POST /api/v1/admin/uploads/cover
Content-Type: multipart/form-data
```

Retorna `{ "url": "...", "asset_id": "..." }`.

### 8.8 Códigos de erro

| Code | HTTP | Descrição |
|---|---|---|
| `TRAINING_NOT_FOUND` | 404 | |
| `INVALID_STATE_TRANSITION` | 409 | Ex: arquivar um draft já arquivado |
| `VALIDATION_FAILED` | 422 | Ver `errors[]` |
| `POLICY_REF_INVALID` | 422 | Política não existe |
| `FORBIDDEN` | 403 | Sem permissão de admin |

---

## 9. Permissões

| Ação | Admin | RH | Gestor | Colaborador |
|---|---|---|---|---|
| Criar treinamento | ✅ | ✅ | ❌ | ❌ |
| Editar próprio draft | ✅ | ✅ (do próprio) | ❌ | ❌ |
| Editar qualquer draft | ✅ | ❌ | ❌ | ❌ |
| Publicar | ✅ | ❌ | ❌ | ❌ |
| Arquivar | ✅ | ❌ | ❌ | ❌ |
| Vincular política | ✅ | ❌ | ❌ | ❌ |

---

## 10. Critérios de aceite

- [ ] Admin consegue criar um treinamento completo com os 5 tipos de módulo e publicar.
- [ ] Autosave de rascunho a cada 5s ou em mudança de campo.
- [ ] Sair e voltar mantém o estado exato (foco, módulo expandido, ordem).
- [ ] Drag & drop reordena módulos com persistência otimista (rollback em erro).
- [ ] Validação bloqueia publicação com mensagens específicas por campo (não "erro genérico").
- [ ] Tentar publicar com quiz < 3 questões mostra erro inline no módulo, não em toast genérico.
- [ ] Versão publicada gera snapshot imutável em `training_versions`.
- [ ] Editar treinamento publicado abre nova versão `draft` sem afetar atribuições existentes.
- [ ] Pré-requisitos não permitem ciclos (A requer B, B requer A → erro).
- [ ] Política vinculada inválida (código inexistente) bloqueia publicação.
- [ ] Aceite de política gera registro em `policy_acceptances` com `ip` e `user_agent`.
- [ ] Card do catálogo reflete categoria, obrigatoriedade e métricas conforme images 1 e 2.
- [ ] Acessibilidade: builder navegável por teclado, drag & drop com fallback de botões `↑`/`↓`, foco visível, leitor de tela anuncia mudança de ordem.

---

## 11. Edge cases e questões em aberto

1. **Excluir módulo já visto por colaboradores em atribuição ativa** — manter o módulo no snapshot da versão antiga ou forçar nova versão? *Proposta:* bloquear exclusão, só permite em nova versão.
2. **Reciclagem anual** — quando dispara nova atribuição? No aniversário da conclusão original ou na data fixa de vencimento? *Proposta:* aniversário da conclusão.
3. **Quiz com peso 0 em alguma questão** — permitir como "pergunta de pesquisa não pontuada"? *Proposta:* sim, e exibir badge "não pontua".
4. **Tarefa com revisor `manager`** — se o colaborador não tem gestor definido, fallback para admin? *Proposta:* sim, com aviso.
5. **Limite de tamanho de payload `content_md`** — definir teto (sugerido: 200KB por módulo).

---

## 12. Métricas a instrumentar

- `training.created` — { training_id, author_id, category }
- `training.published` — { training_id, version, modules_count, types_used[] }
- `training.module.added` — { training_id, type }
- `training.publish.validation_failed` — { training_id, errors[] }
- Tempo médio entre criação e publicação.
- Distribuição de tipos de módulo por treinamento.
