# Sietch Metrics — Backend Blueprint

> Documento técnico completo para implementação do backend da plataforma Metrics, com autenticação Google restrita por domínio corporativo, banco Postgres e API REST consumida pelo frontend já existente.

**Stack escolhida:**
- **Runtime:** Node.js 20 LTS + TypeScript
- **Framework:** Express 4
- **ORM:** Prisma 5
- **Banco:** PostgreSQL (Neon — serverless)
- **Auth:** Google OAuth 2.0 (Authorization Code Flow) + JWT em cookie httpOnly
- **Hospedagem:** Vercel Serverless Functions

---

## Sumário

1. [Visão geral da arquitetura](#1-visão-geral-da-arquitetura)
2. [Modelagem do banco de dados](#2-modelagem-do-banco-de-dados)
3. [Autenticação Google — fluxo completo](#3-autenticação-google--fluxo-completo)
4. [Estrutura de pastas](#4-estrutura-de-pastas)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [API REST — contratos](#6-api-rest--contratos)
7. [Implementação — código de referência](#7-implementação--código-de-referência)
8. [Migração do frontend (localStorage → API)](#8-migração-do-frontend-localstorage--api)
9. [Deploy na Vercel](#9-deploy-na-vercel)
10. [Segurança — checklist](#10-segurança--checklist)
11. [Roadmap e próximos passos](#11-roadmap-e-próximos-passos)

---

## 1. Visão geral da arquitetura

```
┌────────────────────────────────────────────────────────────────┐
│  Browser (sietch-metrics.vercel.app)                              │
│  HTML + CSS + JS Vanilla                                       │
└────────────────────┬───────────────────────────────────────────┘
                     │  fetch() com cookie httpOnly
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  Vercel Serverless Functions (api.sietch-metrics.vercel.app)      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Express App                                             │  │
│  │  ├── /api/auth/google              (inicia OAuth)        │  │
│  │  ├── /api/auth/google/callback     (recebe code)         │  │
│  │  ├── /api/auth/me                  (retorna user atual)  │  │
│  │  ├── /api/auth/logout                                    │  │
│  │  ├── /api/evaluations              (CRUD)                │  │
│  │  └── /api/technicians              (CRUD)                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────┬───────────────────────────────────────────┘
                     │  Prisma Client
                     ▼
┌────────────────────────────────────────────────────────────────┐
│  Neon Postgres (serverless)                                    │
│  - users                                                       │
│  - technicians                                                 │
│  - evaluations                                                 │
│  - evaluation_scores                                           │
│  - audit_log                                                   │
└────────────────────────────────────────────────────────────────┘
                     ▲
                     │  OAuth callback
┌────────────────────┴───────────────────────────────────────────┐
│  Google Identity Platform                                      │
│  - Restringido por hd=suaempresa.com                           │
└────────────────────────────────────────────────────────────────┘
```

**Decisões-chave:**

- **JWT em cookie httpOnly** (não em `localStorage`) — protege contra XSS, e como front e backend ficam no mesmo domínio raiz da Vercel (subdomínios), o cookie funciona sem CORS preflight complexo.
- **Validação dupla do domínio** — passamos o parâmetro `hd` para o Google (ele filtra na tela de login) E validamos server-side no callback (defesa em profundidade).
- **Prisma + Neon serverless driver** — Vercel Functions são stateless, então usamos o adapter `@prisma/adapter-neon` com `@neondatabase/serverless` para evitar exhaustão de connection pool.
- **TypeScript** — não muda nada do que o frontend faz, mas dá segurança no backend (DTOs validados, schema Prisma tipado).

---

## 2. Modelagem do banco de dados

### 2.1 Diagrama lógico

```
┌─────────────────┐         ┌──────────────────┐
│     users       │         │   technicians    │
│─────────────────│         │──────────────────│
│ id (uuid) PK    │         │ id (uuid) PK     │
│ email           │         │ name             │
│ google_id       │         │ email (nullable) │
│ name            │         │ team             │
│ picture         │         │ active           │
│ role (enum)     │         │ created_at       │
│ active          │         │ updated_at       │
│ last_login_at   │         └────────┬─────────┘
│ created_at      │                  │
└────────┬────────┘                  │
         │                           │
         │ evaluator_id              │ technician_id
         │                           │
         ▼                           ▼
       ┌────────────────────────────────┐
       │       evaluations              │
       │────────────────────────────────│
       │ id (uuid) PK                   │
       │ technician_id FK               │
       │ evaluator_id FK                │
       │ technical_score (decimal)      │
       │ behavioral_score (decimal)     │
       │ final_score (decimal)          │
       │ classification (enum)          │
       │ recommendation (enum)          │
       │ observations (text)            │
       │ cycle (string)                 │
       │ created_at                     │
       │ updated_at                     │
       └────────────┬───────────────────┘
                    │
                    │ evaluation_id
                    ▼
       ┌────────────────────────────────┐
       │     evaluation_scores          │
       │────────────────────────────────│
       │ id (uuid) PK                   │
       │ evaluation_id FK               │
       │ block (enum)  -- tec / comp    │
       │ criterion_key (string)         │
       │ score (int 1-5)                │
       │ weight (int)                   │
       └────────────────────────────────┘
```

### 2.2 Schema Prisma completo

Arquivo `prisma/schema.prisma`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────────────────────
// USERS — quem usa a plataforma (RH, líderes)
// ─────────────────────────────────────────────────────────────

enum UserRole {
  ADMIN     // RH — acesso total
  LEADER    // Líder — avalia seu time, vê histórico próprio
  VIEWER    // Somente leitura (futuro)
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  googleId     String    @unique @map("google_id")
  name         String
  picture      String?
  role         UserRole  @default(LEADER)
  active       Boolean   @default(true)
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  evaluations  Evaluation[] @relation("EvaluatorEvaluations")
  auditLogs    AuditLog[]

  @@index([email])
  @@map("users")
}

// ─────────────────────────────────────────────────────────────
// TECHNICIANS — quem é avaliado
// ─────────────────────────────────────────────────────────────

model Technician {
  id          String   @id @default(uuid())
  name        String
  email       String?  @unique
  team        String?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  evaluations Evaluation[]

  @@index([name])
  @@index([team])
  @@map("technicians")
}

// ─────────────────────────────────────────────────────────────
// EVALUATIONS — avaliação completa
// ─────────────────────────────────────────────────────────────

enum Classification {
  OTIMO     // 4.2 – 5.0
  BOM       // 3.2 – 4.1
  REGULAR   // 2.0 – 3.1
  CRITICO   // 0.0 – 1.9
}

enum Recommendation {
  ELEGIVEL_BONUS
  INDICADO_PROMOCAO
  PLANO_DESENVOLVIMENTO
  ATENCAO_URGENTE
}

model Evaluation {
  id               String          @id @default(uuid())
  technicianId     String          @map("technician_id")
  evaluatorId      String          @map("evaluator_id")
  technicalScore   Decimal         @db.Decimal(3, 2) @map("technical_score")
  behavioralScore  Decimal         @db.Decimal(3, 2) @map("behavioral_score")
  finalScore       Decimal         @db.Decimal(3, 2) @map("final_score")
  classification   Classification
  recommendation   Recommendation?
  observations     String?         @db.Text
  cycle            String          // ex: "2026-Q2"
  createdAt        DateTime        @default(now()) @map("created_at")
  updatedAt        DateTime        @updatedAt @map("updated_at")

  technician       Technician         @relation(fields: [technicianId], references: [id])
  evaluator        User               @relation("EvaluatorEvaluations", fields: [evaluatorId], references: [id])
  scores           EvaluationScore[]

  @@index([technicianId])
  @@index([evaluatorId])
  @@index([cycle])
  @@index([createdAt])
  @@map("evaluations")
}

enum CriterionBlock {
  TECNICO
  COMPORTAMENTAL
}

model EvaluationScore {
  id            String         @id @default(uuid())
  evaluationId  String         @map("evaluation_id")
  block         CriterionBlock
  criterionKey  String         @map("criterion_key")  // ex: "qualidade_tecnica"
  score         Int            // 1 a 5
  weight        Int            // 1, 2 ou 3

  evaluation    Evaluation     @relation(fields: [evaluationId], references: [id], onDelete: Cascade)

  @@unique([evaluationId, criterionKey])
  @@map("evaluation_scores")
}

// ─────────────────────────────────────────────────────────────
// AUDIT LOG — rastreabilidade (quem fez o quê)
// ─────────────────────────────────────────────────────────────

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  @map("user_id")
  action     String   // ex: "evaluation.created", "user.login"
  entityType String?  @map("entity_type")
  entityId   String?  @map("entity_id")
  metadata   Json?
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  createdAt  DateTime @default(now()) @map("created_at")

  user       User?    @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_log")
}
```

### 2.3 Por que essa modelagem

- **`technicians` separado de `users`** — o técnico avaliado não é necessariamente quem loga. Permite avaliar pessoas que ainda não têm conta na plataforma e suportar autoavaliação no futuro (quando o técnico tiver `email` preenchido, dá pra fazer match).
- **`evaluation_scores` em tabela separada** — em vez de salvar JSON inline, normalizar permite queries analíticas no futuro (média por critério, evolução por ciclo).
- **`Decimal(3,2)`** para scores — evita problemas de ponto flutuante em médias ponderadas.
- **`audit_log`** — uso interno corporativo exige rastreabilidade. Login, criação e exclusão de avaliações ficam logados.
- **`onDelete: Cascade` nos scores** — deletar avaliação remove os scores junto, mas evaluations não tem cascade no técnico/avaliador (preserva histórico).

---

## 3. Autenticação Google — fluxo completo

### 3.1 Visão geral

Usamos o **Authorization Code Flow** (não o Implicit Flow, que é deprecated). É o fluxo recomendado para apps server-side.

```
┌─────────┐                ┌──────────┐              ┌─────────┐
│ Browser │                │ Backend  │              │ Google  │
└────┬────┘                └────┬─────┘              └────┬────┘
     │                          │                         │
     │  1. GET /auth/google     │                         │
     ├─────────────────────────►│                         │
     │                          │  2. Redirect to Google  │
     │◄─────────────────────────┤  (com state + hd param) │
     │                                                    │
     │  3. Login com Google                               │
     ├───────────────────────────────────────────────────►│
     │                                                    │
     │  4. Redirect /auth/google/callback?code=XXX&state=YYY
     │◄───────────────────────────────────────────────────┤
     │                          │                         │
     │  5. GET /callback        │                         │
     ├─────────────────────────►│  6. Trocar code por tokens
     │                          ├────────────────────────►│
     │                          │  7. id_token + access_token
     │                          │◄────────────────────────┤
     │                          │
     │                          │  8. Validar id_token (JWT)
     │                          │     + verificar hd === DOMAIN
     │                          │     + upsert user no DB
     │                          │     + emitir JWT próprio
     │                          │
     │  9. Set-Cookie: session=JWT (httpOnly, Secure, SameSite=Lax)
     │◄─────────────────────────┤
     │     Redirect /dashboard  │
     │                          │
     │  10. Próximas requests   │
     │      Cookie automaticamente enviado
     ├─────────────────────────►│
     │                          │
```

### 3.2 Configuração no Google Cloud Console

Passo a passo no console da Google:

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um novo projeto (ex: `metrics-internal-auth`)
3. Vá em **APIs & Services → OAuth consent screen**
   - Tipo: **Internal** (só funciona para Google Workspace; se sua empresa não tiver Workspace, use **External**)
   - Nome do app: `Metrics`
   - Email de suporte: seu email corporativo
   - Logo (opcional): use o `logo-dark.svg` convertido para PNG
   - Domínios autorizados: `vercel.app` (ou seu domínio customizado)
   - Scopes: `openid`, `email`, `profile`
4. Vá em **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Tipo: **Web application**
   - Nome: `Sietch Metrics Production`
   - **Authorized JavaScript origins:**
     - `https://sietch-metrics.vercel.app`
     - `http://localhost:3000` (para dev)
   - **Authorized redirect URIs:**
     - `https://api.sietch-metrics.vercel.app/api/auth/google/callback`
     - `http://localhost:3000/api/auth/google/callback`
5. Copie **Client ID** e **Client Secret** — vão para as variáveis de ambiente.

> **Nota sobre `Internal` vs `External`:** Se sua empresa usa Google Workspace, "Internal" é o ideal — só emails do seu Workspace conseguem fazer login, mesmo que alguém descubra a URL. Se não usar Workspace, mantenha "External" mas a validação do `hd` no backend bloqueia outros domínios.

### 3.3 Restrição por domínio — defesa em profundidade

A restrição é aplicada em **três camadas**:

**Camada 1 — Tela de login do Google (`hd` parameter)**
```typescript
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: GOOGLE_CLIENT_ID,
  redirect_uri: GOOGLE_REDIRECT_URI,
  response_type: 'code',
  scope: 'openid email profile',
  hd: ALLOWED_DOMAIN,           // ← filtra contas exibidas
  state: stateToken,
  access_type: 'offline',
  prompt: 'select_account'
})}`;
```

> **Atenção:** O `hd` parameter **não é uma garantia de segurança** — pode ser removido por um usuário malicioso interceptando a URL. Por isso a validação real acontece na camada 2.

**Camada 2 — Validação do `id_token` (JWT) no callback**

O Google retorna um JWT assinado contendo:
```json
{
  "iss": "https://accounts.google.com",
  "aud": "<seu-client-id>",
  "sub": "1234567890",
  "email": "kauan@suaempresa.com",
  "email_verified": true,
  "hd": "suaempresa.com",        ← campo confiável (assinado)
  "name": "Kauan Santos",
  "picture": "https://..."
}
```

Validamos com a biblioteca `google-auth-library`:
```typescript
const ticket = await oauth2Client.verifyIdToken({
  idToken: tokens.id_token,
  audience: GOOGLE_CLIENT_ID,
});
const payload = ticket.getPayload();

if (payload.hd !== ALLOWED_DOMAIN) {
  throw new ForbiddenError('Domínio não autorizado');
}
if (!payload.email_verified) {
  throw new ForbiddenError('Email não verificado');
}
```

**Camada 3 — Whitelist opcional no banco**

Se algum dia precisar bloquear um usuário específico (ex: ex-funcionário), basta marcar `users.active = false`. O middleware checa isso em toda request.

### 3.4 Sessão — JWT em cookie httpOnly

Após validar o usuário, emitimos nosso **próprio JWT** (não usamos o do Google diretamente):

```typescript
const sessionToken = jwt.sign(
  { userId: user.id, email: user.email, role: user.role },
  JWT_SECRET,
  { expiresIn: '7d' }
);

res.cookie('sietch_session', sessionToken, {
  httpOnly: true,        // não acessível via document.cookie
  secure: true,          // só via HTTPS
  sameSite: 'lax',       // bloqueia CSRF mas permite navegação normal
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 dias
  path: '/',
});
```

**Por que JWT próprio em vez do `id_token` do Google?**
- Controle total da expiração
- Podemos invalidar sessões (lista de revogação)
- Podemos colocar nosso `role` no payload sem depender de claims externas
- Funciona offline em relação ao Google após login

---

## 4. Estrutura de pastas

```
sietch-metrics-backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                      # Cria primeiro admin
├── src/
│   ├── config/
│   │   ├── env.ts                   # Validação de env vars (zod)
│   │   ├── prisma.ts                # Cliente Prisma singleton
│   │   └── google.ts                # OAuth client
│   ├── middleware/
│   │   ├── auth.ts                  # requireAuth, requireRole
│   │   ├── error-handler.ts
│   │   ├── rate-limit.ts
│   │   └── audit.ts                 # log automático de ações
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── evaluations.routes.ts
│   │   ├── technicians.routes.ts
│   │   └── users.routes.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── evaluation.service.ts
│   │   └── technician.service.ts
│   ├── schemas/                     # validação zod dos DTOs
│   │   ├── evaluation.schema.ts
│   │   └── technician.schema.ts
│   ├── utils/
│   │   ├── classification.ts        # lógica de cálculo de notas
│   │   ├── errors.ts                # AppError, NotFoundError, etc.
│   │   └── logger.ts
│   ├── types/
│   │   └── express.d.ts             # estende Request com user
│   └── app.ts                       # exporta o Express app
├── api/
│   └── index.ts                     # entry point Vercel (serverless)
├── tests/
│   ├── auth.test.ts
│   └── evaluation.test.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

**Por que `api/index.ts` separado de `src/app.ts`?**
A Vercel detecta arquivos em `api/` como serverless functions. O `app.ts` exporta a instância Express, e `api/index.ts` apenas a importa e exporta como handler. Isso permite rodar localmente com `npm run dev` (server tradicional) E em produção como serverless sem mudar nada.

---

## 5. Variáveis de ambiente

Arquivo `.env.example` (commitar) — **nunca commitar `.env`**:

```bash
# ─── Banco de dados (Neon) ──────────────────────────────────────
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/metrics?sslmode=require"

# ─── Google OAuth ───────────────────────────────────────────────
GOOGLE_CLIENT_ID="xxxxxxxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxx"
GOOGLE_REDIRECT_URI="https://api.sietch-metrics.vercel.app/api/auth/google/callback"

# ─── Restrição de domínio ───────────────────────────────────────
ALLOWED_EMAIL_DOMAIN="suaempresa.com"

# ─── Sessão ─────────────────────────────────────────────────────
JWT_SECRET="<gere com: openssl rand -base64 64>"
SESSION_COOKIE_NAME="sietch_session"
SESSION_MAX_AGE_DAYS="7"

# ─── Frontend ───────────────────────────────────────────────────
FRONTEND_URL="https://sietch-metrics.vercel.app"
ALLOWED_ORIGINS="https://sietch-metrics.vercel.app,http://localhost:3000"

# ─── App ────────────────────────────────────────────────────────
NODE_ENV="production"
PORT="3000"
LOG_LEVEL="info"

# ─── Bootstrap ──────────────────────────────────────────────────
# Email do primeiro admin (criado no seed)
INITIAL_ADMIN_EMAIL="kauan@suaempresa.com"
```

**Como gerar o `JWT_SECRET`:**
```bash
openssl rand -base64 64
# ou em Node:
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

**Validação com Zod** (`src/config/env.ts`):
```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  ALLOWED_EMAIL_DOMAIN: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
  JWT_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('sietch_session'),
  SESSION_MAX_AGE_DAYS: z.coerce.number().default(7),
  FRONTEND_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().transform(s => s.split(',')),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),
});

export const env = envSchema.parse(process.env);
```

---

## 6. API REST — contratos

### 6.1 Convenções

- **Base URL produção:** `https://api.sietch-metrics.vercel.app`
- **Content-Type:** `application/json`
- **Autenticação:** cookie `sietch_session` (httpOnly) — enviado automaticamente
- **Erros:** sempre JSON `{ error: { code, message, details? } }`
- **Paginação:** query params `?page=1&limit=20` (cursor-based no futuro)
- **Datas:** ISO 8601 UTC

### 6.2 Endpoints

#### Autenticação

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/api/auth/google` | Redireciona para Google | — |
| GET | `/api/auth/google/callback` | Recebe code do Google | — |
| GET | `/api/auth/me` | Retorna usuário logado | ✓ |
| POST | `/api/auth/logout` | Limpa cookie de sessão | ✓ |

**`GET /api/auth/me` — resposta:**
```json
{
  "user": {
    "id": "uuid",
    "email": "kauan@suaempresa.com",
    "name": "Kauan Santos",
    "picture": "https://lh3.googleusercontent.com/...",
    "role": "ADMIN",
    "lastLoginAt": "2026-04-29T14:30:00Z"
  }
}
```

#### Avaliações

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/api/evaluations` | Lista (filtros via query) | ✓ |
| GET | `/api/evaluations/:id` | Detalhe | ✓ |
| POST | `/api/evaluations` | Cria nova | ✓ |
| PATCH | `/api/evaluations/:id` | Edita (apenas autor ou admin) | ✓ |
| DELETE | `/api/evaluations/:id` | Remove (apenas admin) | ✓ admin |

**Filtros suportados em `GET /api/evaluations`:**
```
?technicianId=uuid
&evaluatorId=uuid
&cycle=2026-Q2
&classification=OTIMO
&from=2026-01-01
&to=2026-04-30
&page=1
&limit=20
```

**`POST /api/evaluations` — payload:**
```json
{
  "technicianId": "uuid",
  "cycle": "2026-Q2",
  "scores": [
    { "block": "TECNICO", "criterionKey": "qualidade_tecnica", "score": 5, "weight": 3 },
    { "block": "TECNICO", "criterionKey": "resolucao_problemas", "score": 4, "weight": 3 },
    { "block": "TECNICO", "criterionKey": "produtividade", "score": 5, "weight": 3 },
    { "block": "TECNICO", "criterionKey": "dominio_ferramentas", "score": 4, "weight": 2 },
    { "block": "TECNICO", "criterionKey": "documentacao", "score": 3, "weight": 1 },
    { "block": "COMPORTAMENTAL", "criterionKey": "colaboracao", "score": 5, "weight": 3 },
    { "block": "COMPORTAMENTAL", "criterionKey": "cultura", "score": 5, "weight": 3 },
    { "block": "COMPORTAMENTAL", "criterionKey": "dedicacao", "score": 4, "weight": 3 },
    { "block": "COMPORTAMENTAL", "criterionKey": "postura", "score": 4, "weight": 2 },
    { "block": "COMPORTAMENTAL", "criterionKey": "iniciativa", "score": 5, "weight": 2 }
  ],
  "observations": "Texto livre opcional",
  "recommendation": "ELEGIVEL_BONUS"
}
```

> **Importante:** o backend **recalcula** `technicalScore`, `behavioralScore`, `finalScore` e `classification` a partir dos `scores` — nunca confia no que vem do cliente. Isso garante integridade.

**Resposta:**
```json
{
  "evaluation": {
    "id": "uuid",
    "technician": { "id": "uuid", "name": "João Silva", "team": "Suporte N2" },
    "evaluator": { "id": "uuid", "name": "Kauan Santos" },
    "technicalScore": 4.50,
    "behavioralScore": 4.65,
    "finalScore": 4.56,
    "classification": "OTIMO",
    "recommendation": "ELEGIVEL_BONUS",
    "observations": "...",
    "cycle": "2026-Q2",
    "scores": [ /* ... */ ],
    "createdAt": "2026-04-29T14:30:00Z"
  }
}
```

#### Técnicos

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/api/technicians` | Lista (busca por nome/time) | ✓ |
| POST | `/api/technicians` | Cria | ✓ admin |
| PATCH | `/api/technicians/:id` | Edita | ✓ admin |
| DELETE | `/api/technicians/:id` | Inativa (soft delete) | ✓ admin |

#### Usuários (admin)

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/api/users` | Lista | ✓ admin |
| PATCH | `/api/users/:id` | Muda role/active | ✓ admin |

### 6.3 Códigos de erro padronizados

| HTTP | Code | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Payload inválido (Zod) |
| 401 | `UNAUTHENTICATED` | Sem cookie ou JWT inválido |
| 403 | `FORBIDDEN_DOMAIN` | Email não é do domínio permitido |
| 403 | `FORBIDDEN_ROLE` | Role não autorizada |
| 403 | `USER_INACTIVE` | Conta desativada |
| 404 | `NOT_FOUND` | Recurso não existe |
| 409 | `CONFLICT` | Ex: avaliação duplicada no ciclo |
| 429 | `RATE_LIMITED` | Muitas requests |
| 500 | `INTERNAL_ERROR` | Erro não tratado |

---

## 7. Implementação — código de referência

### 7.1 `package.json`

```json
{
  "name": "sietch-metrics-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts",
    "test": "vitest"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.9.0",
    "@prisma/adapter-neon": "^5.20.0",
    "@prisma/client": "^5.20.0",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "express-rate-limit": "^7.4.0",
    "google-auth-library": "^9.14.0",
    "helmet": "^8.0.0",
    "jsonwebtoken": "^9.0.2",
    "pino": "^9.5.0",
    "pino-http": "^10.3.0",
    "ws": "^8.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.7.0",
    "prisma": "^5.20.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

### 7.2 `src/config/prisma.ts` — Prisma + Neon serverless

```typescript
import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import ws from 'ws';
import { env } from './env';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaNeon(pool);

export const prisma = new PrismaClient({ adapter });
```

### 7.3 `src/config/google.ts`

```typescript
import { OAuth2Client } from 'google-auth-library';
import { env } from './env';

export const googleClient = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI,
});

export function buildGoogleAuthUrl(state: string): string {
  return googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    hd: env.ALLOWED_EMAIL_DOMAIN,
    state,
    prompt: 'select_account',
  });
}
```

### 7.4 `src/routes/auth.routes.ts` — núcleo do OAuth

```typescript
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { googleClient, buildGoogleAuthUrl } from '../config/google';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../middleware/audit';

const router = Router();

// Cookie temporário pra guardar o `state` (CSRF protection)
const STATE_COOKIE = 'sietch_oauth_state';

// ─── 1. Inicia o fluxo ──────────────────────────────────────
router.get('/google', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 min
  });

  const url = buildGoogleAuthUrl(state);
  res.redirect(url);
});

// ─── 2. Callback ─────────────────────────────────────────────
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    const expectedState = req.cookies[STATE_COOKIE];

    // Limpa cookie de state imediatamente
    res.clearCookie(STATE_COOKIE);

    if (error) {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=${error}`);
    }

    // 2.1 Valida CSRF
    if (!state || state !== expectedState) {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=invalid_state`);
    }

    if (typeof code !== 'string') {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=missing_code`);
    }

    // 2.2 Troca code por tokens
    const { tokens } = await googleClient.getToken(code);

    if (!tokens.id_token) {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=no_id_token`);
    }

    // 2.3 Verifica id_token (assinatura, expiração, audience)
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=invalid_token`);
    }

    // 2.4 VALIDAÇÃO CRÍTICA: domínio + email_verified
    if (payload.hd !== env.ALLOWED_EMAIL_DOMAIN) {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=forbidden_domain`);
    }
    if (!payload.email_verified) {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=email_not_verified`);
    }

    // Validação extra (defense in depth)
    if (!payload.email.endsWith(`@${env.ALLOWED_EMAIL_DOMAIN}`)) {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=forbidden_domain`);
    }

    // 2.5 Upsert user
    const user = await prisma.user.upsert({
      where: { googleId: payload.sub },
      create: {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email.split('@')[0],
        picture: payload.picture,
        role: payload.email === env.INITIAL_ADMIN_EMAIL ? 'ADMIN' : 'LEADER',
        lastLoginAt: new Date(),
      },
      update: {
        email: payload.email,
        name: payload.name ?? undefined,
        picture: payload.picture,
        lastLoginAt: new Date(),
      },
    });

    if (!user.active) {
      return res.redirect(`${env.FRONTEND_URL}/?auth_error=user_inactive`);
    }

    // 2.6 Auditoria
    await logAudit({
      userId: user.id,
      action: 'user.login',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // 2.7 Emite JWT próprio
    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: `${env.SESSION_MAX_AGE_DAYS}d` }
    );

    res.cookie(env.SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.redirect(env.FRONTEND_URL);
  } catch (err) {
    next(err);
  }
});

// ─── 3. /me ─────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true, email: true, name: true, picture: true,
      role: true, lastLoginAt: true,
    },
  });
  if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
  res.json({ user });
});

// ─── 4. Logout ──────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  await logAudit({ userId: req.user!.userId, action: 'user.logout' });
  res.clearCookie(env.SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

export default router;
```

### 7.5 `src/middleware/auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; email: string; role: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies[env.SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any;

    // Confirma que o user ainda está ativo (importante!)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, active: true },
    });

    if (!user || !user.active) {
      res.clearCookie(env.SESSION_COOKIE_NAME);
      return res.status(403).json({ error: { code: 'USER_INACTIVE' } });
    }

    req.user = { userId: user.id, email: user.email, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN_ROLE' } });
    }
    next();
  };
}
```

### 7.6 `src/utils/classification.ts` — lógica de cálculo

```typescript
import { Classification } from '@prisma/client';

export interface ScoreInput {
  block: 'TECNICO' | 'COMPORTAMENTAL';
  score: number;
  weight: number;
}

export function calculateScores(scores: ScoreInput[]) {
  const tecnicos = scores.filter(s => s.block === 'TECNICO');
  const comports = scores.filter(s => s.block === 'COMPORTAMENTAL');

  const technicalScore = weightedAverage(tecnicos);
  const behavioralScore = weightedAverage(comports);
  const finalScore = technicalScore * 0.6 + behavioralScore * 0.4;

  return {
    technicalScore: round(technicalScore),
    behavioralScore: round(behavioralScore),
    finalScore: round(finalScore),
    classification: classify(finalScore),
  };
}

function weightedAverage(scores: ScoreInput[]): number {
  if (scores.length === 0) return 0;
  const totalWeight = scores.reduce((s, c) => s + c.weight, 0);
  const sum = scores.reduce((s, c) => s + c.score * c.weight, 0);
  return sum / totalWeight;
}

function classify(score: number): Classification {
  if (score >= 4.2) return 'OTIMO';
  if (score >= 3.2) return 'BOM';
  if (score >= 2.0) return 'REGULAR';
  return 'CRITICO';
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
```

### 7.7 `src/routes/evaluations.routes.ts` — exemplo de CRUD

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { calculateScores } from '../utils/classification';
import { logAudit } from '../middleware/audit';

const router = Router();

const createSchema = z.object({
  technicianId: z.string().uuid(),
  cycle: z.string().regex(/^\d{4}-Q[1-4]$/),
  scores: z.array(z.object({
    block: z.enum(['TECNICO', 'COMPORTAMENTAL']),
    criterionKey: z.string().min(1).max(50),
    score: z.number().int().min(1).max(5),
    weight: z.number().int().min(1).max(3),
  })).length(10),
  observations: z.string().max(5000).optional(),
  recommendation: z.enum([
    'ELEGIVEL_BONUS', 'INDICADO_PROMOCAO',
    'PLANO_DESENVOLVIMENTO', 'ATENCAO_URGENTE'
  ]).optional(),
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const calc = calculateScores(data.scores);

    const evaluation = await prisma.evaluation.create({
      data: {
        technicianId: data.technicianId,
        evaluatorId: req.user!.userId,
        cycle: data.cycle,
        observations: data.observations,
        recommendation: data.recommendation,
        ...calc,
        scores: { create: data.scores },
      },
      include: {
        technician: true,
        evaluator: { select: { id: true, name: true, email: true } },
        scores: true,
      },
    });

    await logAudit({
      userId: req.user!.userId,
      action: 'evaluation.created',
      entityType: 'evaluation',
      entityId: evaluation.id,
      metadata: { technicianId: evaluation.technicianId, finalScore: calc.finalScore },
    });

    res.status(201).json({ evaluation });
  } catch (err) { next(err); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { technicianId, cycle, classification, page = '1', limit = '20' } = req.query;
    const where: any = {};

    if (technicianId) where.technicianId = String(technicianId);
    if (cycle) where.cycle = String(cycle);
    if (classification) where.classification = String(classification);

    // LEADER só vê suas próprias avaliações; ADMIN vê todas
    if (req.user!.role === 'LEADER') {
      where.evaluatorId = req.user!.userId;
    }

    const [items, total] = await Promise.all([
      prisma.evaluation.findMany({
        where,
        include: {
          technician: true,
          evaluator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.evaluation.count({ where }),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.evaluation.delete({ where: { id: req.params.id } });
    await logAudit({
      userId: req.user!.userId,
      action: 'evaluation.deleted',
      entityType: 'evaluation',
      entityId: req.params.id,
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
```

### 7.8 `src/app.ts` — montagem

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import evaluationRoutes from './routes/evaluations.routes';
import technicianRoutes from './routes/technicians.routes';
import userRoutes from './routes/users.routes';
import { errorHandler } from './middleware/error-handler';

const app = express();

app.set('trust proxy', 1); // Vercel coloca o IP real em X-Forwarded-For

app.use(helmet());
app.use(cors({
  origin: env.ALLOWED_ORIGINS,
  credentials: true, // permite cookies
}));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(pinoHttp());

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
}));

// Rate limit mais agressivo no login
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/users', userRoutes);

app.use(errorHandler);

export default app;
```

### 7.9 `api/index.ts` — entry Vercel

```typescript
import app from '../src/app';
export default app;
```

### 7.10 `src/server.ts` — dev local

```typescript
import app from './app';

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Sietch Metrics API rodando em http://localhost:${port}`);
});
```

### 7.11 `prisma/seed.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';

const prisma = new PrismaClient();

async function main() {
  if (!env.INITIAL_ADMIN_EMAIL) {
    console.log('Sem INITIAL_ADMIN_EMAIL configurado, pulando seed.');
    return;
  }
  console.log(`Admin inicial: ${env.INITIAL_ADMIN_EMAIL} (será marcado como ADMIN no primeiro login).`);
}

main().finally(() => prisma.$disconnect());
```

> **Nota:** o admin não é criado no seed (precisa do `googleId` que só vem no primeiro login). O seed apenas confirma a config; a rota de callback faz o upsert e atribui `ADMIN` se o email bater com `INITIAL_ADMIN_EMAIL`.

---

## 8. Migração do frontend (localStorage → API)

O `index.html` atual usa funções como `saveEvaluation()`, `loadHistory()`, etc., que escrevem em `localStorage`. Substituímos por chamadas `fetch`. Como o backend usa cookie httpOnly, **toda chamada precisa de `credentials: 'include'`**.

### 8.1 Cliente HTTP

Adicionar no topo do `<script>` em `index.html`:

```javascript
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://api.sietch-metrics.vercel.app/api';

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    // Sessão expirou — redireciona pro login
    window.location.href = `${API_BASE}/auth/google`;
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Erro desconhecido' } }));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}
```

### 8.2 Bootstrap — checa sessão antes de renderizar

```javascript
async function bootstrap() {
  try {
    const { user } = await api('/auth/me');
    renderUserBadge(user);
    init(); // função que monta a UI
  } catch {
    // Não logado — mostra tela de login
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.body.innerHTML = `
    <div class="login-screen">
      <img src="logo-dark.svg" class="login-logo" alt="Metrics" />
      <h1>Metrics</h1>
      <p>Plataforma interna de avaliação de performance</p>
      <a href="${API_BASE}/auth/google" class="btn-google">
        <svg><!-- ícone Google --></svg>
        Entrar com Google
      </a>
      <p class="login-hint">
        Use sua conta @suaempresa.com
      </p>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', bootstrap);
```

### 8.3 Tratamento de erro de domínio

Quando o callback redireciona com `?auth_error=forbidden_domain`, mostrar mensagem clara:

```javascript
const params = new URLSearchParams(window.location.search);
const authError = params.get('auth_error');

if (authError) {
  const messages = {
    forbidden_domain: 'Acesso restrito a contas @suaempresa.com',
    user_inactive: 'Sua conta foi desativada. Procure o RH.',
    invalid_state: 'Sessão expirada, tente novamente.',
  };
  showToast(messages[authError] || 'Erro de autenticação', 'error');
  // Limpa a query string
  window.history.replaceState({}, '', window.location.pathname);
}
```

### 8.4 Substituições — antes vs. depois

**Salvar avaliação — antes:**
```javascript
function saveEvaluation() {
  const evaluation = { /* ... */ };
  history.unshift(evaluation);
  localStorage.setItem('sietch_history', JSON.stringify(history));
  showResults(evaluation);
}
```

**Depois:**
```javascript
async function saveEvaluation() {
  try {
    const payload = {
      technicianId: currentTechnicianId,
      cycle: currentCycle, // ex: '2026-Q2'
      scores: collectScores(), // monta array no formato da API
      observations: document.getElementById('observations').value,
      recommendation: document.getElementById('recommendation').value || undefined,
    };
    const { evaluation } = await api('/evaluations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showResults(evaluation);
    showToast('Avaliação salva', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
```

**Carregar histórico — antes:**
```javascript
const history = JSON.parse(localStorage.getItem('sietch_history') || '[]');
```

**Depois:**
```javascript
async function loadHistory() {
  const { items } = await api('/evaluations?limit=50');
  return items;
}
```

### 8.5 Migração dos dados antigos (opcional)

Se você já tem avaliações salvas no `localStorage` em produção, vale fazer um botão "Importar do localStorage" que faz POST de cada avaliação antiga uma vez. Depois desse import, limpar o `localStorage`.

```javascript
async function migrateLocalStorage() {
  const old = JSON.parse(localStorage.getItem('sietch_history') || '[]');
  for (const ev of old) {
    try {
      await api('/evaluations', { method: 'POST', body: JSON.stringify(transformOldFormat(ev)) });
    } catch (e) {
      console.warn('Falha ao migrar', ev.id, e);
    }
  }
  localStorage.removeItem('sietch_history');
  showToast(`${old.length} avaliações migradas`, 'success');
}
```

### 8.6 Mantendo `localStorage` apenas para tema

O tema (`sietch_theme`) pode continuar no `localStorage` — é só preferência visual, não precisa de servidor.

---

## 9. Deploy na Vercel

### 9.1 Repositório separado vs. monorepo

Recomendo **repositório separado** (`sietch-metrics-api`) porque:
- O frontend é estático e tem deploy próprio
- O backend tem migrations Prisma que precisam rodar antes
- Logs e configs ficam isolados

### 9.2 `vercel.json`

```json
{
  "version": 2,
  "buildCommand": "npm run build && npx prisma generate",
  "installCommand": "npm install",
  "framework": null,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" }
  ],
  "functions": {
    "api/index.ts": {
      "maxDuration": 10,
      "memory": 1024
    }
  }
}
```

### 9.3 Configuração na Vercel UI

1. Importar o repo `sietch-metrics-api`
2. **Environment Variables** — adicionar todas do `.env.example` com valores de produção
3. **Domain** — apontar `api.sietch-metrics.vercel.app` (ou domínio próprio)
4. **Build & Development Settings:**
   - Framework Preset: Other
   - Build command: `npm run build && npx prisma generate`
   - Output directory: vazio
   - Install command: `npm install`

### 9.4 Migrations em produção

Como Vercel é serverless e não roda comandos arbitrários, há duas opções:

**Opção A — Rodar localmente apontando pro DB de produção (mais simples):**
```bash
DATABASE_URL="<URL_NEON_PROD>" npx prisma migrate deploy
```

**Opção B — GitHub Actions (recomendado quando tiver mais devs):**
```yaml
# .github/workflows/migrate.yml
name: Migrate DB
on:
  push:
    branches: [main]
    paths: ['prisma/migrations/**']
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### 9.5 Setup do Neon

1. Criar conta em [neon.tech](https://neon.tech)
2. Criar projeto `metrics-prod`
3. Copiar a connection string (formato `postgresql://user:pass@host/db?sslmode=require`)
4. Criar branch `dev` no Neon para desenvolvimento (free tier permite até 10 branches)
5. Importante: usar a **pooled connection** (`...-pooler.neon.tech`) para Vercel — evita esgotamento de conexões em alta concorrência

### 9.6 Domínio customizado (opcional)

Se a empresa tiver domínio próprio:
- Frontend: `metrics.suaempresa.com`
- Backend: `api.metrics.suaempresa.com`

Cookie de sessão funciona melhor com domínios irmãos. Adicionar `SameSite=lax` (já configurado) é suficiente nesse caso.

---

## 10. Segurança — checklist

### 10.1 Autenticação e sessão

- [x] **JWT em cookie httpOnly** — não acessível via JS, mitiga XSS
- [x] **`Secure: true` em produção** — só via HTTPS
- [x] **`SameSite: lax`** — bloqueia CSRF em POST cross-site
- [x] **`state` parameter no OAuth** — bloqueia CSRF no callback
- [x] **Validação dupla do domínio** — `hd` parameter + verificação server-side
- [x] **`email_verified` obrigatório** — bloqueia contas Google sem email confirmado
- [x] **Verificação de `active` em toda request** — desativar usuário tem efeito imediato
- [x] **`audience` validado no `id_token`** — evita confused deputy

### 10.2 Validação de input

- [x] **Zod em todos os payloads** — não confiar em nada do cliente
- [x] **Recálculo das notas no servidor** — cliente não pode forjar `finalScore`
- [x] **`express.json({ limit: '100kb' })`** — bloqueia payloads gigantes
- [x] **Sanitização do `cycle`** — regex `^\d{4}-Q[1-4]$`
- [x] **`onDelete: Cascade` apenas onde faz sentido**

### 10.3 Headers e proteções

- [x] **`helmet`** — Content-Security-Policy, HSTS, X-Frame-Options, etc.
- [x] **`cors` com whitelist explícita** — não usar `*`
- [x] **`trust proxy: 1`** — IP real para rate limit e audit
- [x] **Rate limit global + agressivo no login**

### 10.4 Banco e segredos

- [x] **`JWT_SECRET` com 64 bytes random** — nunca commitado
- [x] **`DATABASE_URL` com SSL** (`?sslmode=require`)
- [x] **Backup automático do Neon** (free tier inclui PITR de 24h)
- [x] **Prisma usa parameterized queries** — imune a SQL injection
- [x] **Variáveis sensíveis só na Vercel UI**, nunca no repo

### 10.5 Auditoria

- [x] **Tabela `audit_log`** registra login, logout, criação e exclusão
- [x] **IP e User-Agent armazenados** em login

### 10.6 LGPD — boas práticas

- [x] **Acesso interno apenas** — domínio restrito
- [x] **Data retention** — implementar política de exclusão após N anos (não urgente, mas considerar)
- [x] **Direito de exportação** — endpoint `/api/users/me/export` (futuro)

### 10.7 O que NÃO fazer

- ❌ Confiar no `email` sem `email_verified`
- ❌ Aceitar `id_token` sem validar `audience`
- ❌ Salvar JWT em `localStorage` (vulnerável a XSS)
- ❌ Permitir CORS `*` com `credentials: true` (o browser já bloqueia, mas evite)
- ❌ Usar HTTP em produção
- ❌ Logar tokens, senhas ou dados sensíveis no Pino

---

## 11. Roadmap e próximos passos

### Fase 1 — MVP do backend (1–2 semanas)

1. Setup do repositório + Prisma + primeira migration
2. Configurar OAuth no Google Cloud
3. Implementar rotas de auth (`/google`, `/callback`, `/me`, `/logout`)
4. Implementar CRUD de evaluations e technicians
5. Migrar frontend para usar a API
6. Deploy Vercel + Neon
7. Testar com 2-3 usuários internos

### Fase 2 — Hardening (1 semana)

1. Adicionar testes (Vitest + supertest)
2. Configurar CI/CD com GitHub Actions
3. Adicionar Sentry ou logflare para observabilidade
4. Endpoint de export `.csv` para análise no Excel

### Fase 3 — Features do roadmap original

Reaproveitando o roadmap do README original, agora viáveis com backend:

| Feature | Como implementar |
|---|---|
| **Painel comparativo** | Endpoint `/api/analytics/team-comparison?team=X&cycle=Y` que agrupa avaliações por time |
| **Roles RH vs líderes** | Já implementado — `requireRole('ADMIN')` em endpoints sensíveis |
| **Calibração** | Adicionar `Evaluation.calibrationStatus` + endpoint `/api/evaluations/:id/calibrate` |
| **Autoavaliação** | Permitir `evaluatorId === technician.userId` quando `Technician.email` bate |
| **Dashboard gerencial** | Queries agregadas com `prisma.evaluation.groupBy` |
| **Export `.docx`/`.pdf`** | `docx` ou `pdfkit` no backend, retorna stream binário |
| **Notificações** | Cron Vercel + envio via Resend (email transacional) |

---

## Apêndice A — Comandos úteis

```bash
# Setup inicial do projeto
mkdir sietch-metrics-backend && cd sietch-metrics-backend
npm init -y
npm install express @prisma/client @prisma/adapter-neon @neondatabase/serverless ws \
  google-auth-library jsonwebtoken cookie-parser cors helmet express-rate-limit \
  pino pino-http zod
npm install -D typescript tsx @types/node @types/express @types/jsonwebtoken \
  @types/cookie-parser @types/cors prisma vitest

npx tsc --init
npx prisma init

# Migration inicial
npx prisma migrate dev --name init

# Gerar client após mudar schema
npx prisma generate

# Resetar DB (cuidado!)
npx prisma migrate reset

# Studio (UI pro banco)
npx prisma studio

# Testar OAuth localmente com domínio
# (use ngrok pra expor o callback)
ngrok http 3000
# → atualizar GOOGLE_REDIRECT_URI no .env e no console Google

# Deploy
vercel --prod
```

## Apêndice B — Estrutura mínima de arquivo de teste

```typescript
// tests/auth.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('Auth', () => {
  it('GET /api/auth/google redireciona pro Google', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
    expect(res.headers.location).toContain('hd=suaempresa.com');
  });

  it('GET /api/auth/me sem cookie retorna 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
```

---

*Documento técnico — Sietch Metrics Backend — gerado para o projeto Sietch Metrics.*
