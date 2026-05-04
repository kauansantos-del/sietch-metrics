# Sietch Metrics — Backend

API REST para a plataforma Sietch Metrics — metodologia PACT (Performance, Atitude, Cultura e Técnica).
Implementação do [SIETCH_METRICS_BACKEND_BLUEPRINT.md](../SIETCH_METRICS_BACKEND_BLUEPRINT.md).

## Stack

- **Runtime:** Node.js 20 LTS + TypeScript
- **Framework:** Express 4
- **ORM:** Prisma 5
- **Banco:** PostgreSQL (Supabase) — pooler PgBouncer no runtime + direct para migrations
- **Auth:** Google OAuth 2.0 + JWT em cookie httpOnly
- **Deploy:** Vercel Serverless Functions

## Estrutura

```
backend/
├── api/index.ts                # Entry serverless (Vercel)
├── prisma/
│   ├── schema.prisma           # Modelo de dados
│   └── seed.ts                 # Bootstrap do admin inicial
├── src/
│   ├── app.ts                  # Express app (helmet, cors, rate-limit, rotas)
│   ├── server.ts               # Entry local (tsx watch)
│   ├── config/                 # env (zod), prisma, google
│   ├── middleware/             # auth, audit, error-handler
│   ├── routes/                 # auth, evaluations, technicians, users
│   ├── services/               # lógica de negócio
│   ├── schemas/                # validação zod dos DTOs
│   ├── utils/                  # errors, classification (cálculo Sietch Metrics), logger
│   └── types/express.d.ts      # extensão tipada do Request
├── .env.example
├── tsconfig.json
├── vercel.json
└── package.json
```

## Setup local

### 1. Instalar dependências

```bash
cd backend
npm install
```

### 2. Configurar `.env`

```bash
cp .env.example .env
```

Preencher:

- `DATABASE_URL` / `DIRECT_URL` — connection strings do Supabase (criar conta em [supabase.com](https://supabase.com) → Project → Settings → Database)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud Console → Credentials
- `GOOGLE_REDIRECT_URI` — `http://localhost:3000/api/auth/google/callback` em dev
- `ALLOWED_EMAIL_DOMAIN` — domínio corporativo (ex: `suaempresa.com`)
- `JWT_SECRET` — gerar com `openssl rand -base64 64`
- `INITIAL_ADMIN_EMAIL` — email que vira admin no primeiro login

### 3. Criar tabelas (primeira vez)

```bash
npm run db:migrate -- --name init
```

Roda a primeira migration e cria todas as tabelas no Postgres.

### 4. Rodar em dev

```bash
npm run dev
```

API sobe em `http://localhost:3000`. Health check: `GET /api/health`.

### 5. Visualizar o banco (opcional)

```bash
npm run db:studio
```

Abre Prisma Studio em `http://localhost:5555`.

## Configurar Google OAuth

1. [console.cloud.google.com](https://console.cloud.google.com) → criar projeto `pact-internal-auth`
2. **APIs & Services → OAuth consent screen**
   - Tipo: **Internal** (se sua empresa usa Google Workspace) ou **External**
   - Scopes: `openid`, `email`, `profile`
3. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Tipo: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `https://sietch-metrics.vercel.app` (produção)
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback`
     - `https://api.sietch-metrics.vercel.app/api/auth/google/callback`
4. Copiar **Client ID** e **Client Secret** para o `.env`

## Endpoints

Base URL local: `http://localhost:3000`

| Método  | Rota                         | Auth        | Descrição                                |
| ------- | ---------------------------- | ----------- | ---------------------------------------- |
| GET     | `/api/health`                | —           | Health check                             |
| GET     | `/api/auth/google`           | —           | Redireciona para Google                  |
| GET     | `/api/auth/google/callback`  | —           | Recebe code, valida domínio, emite JWT   |
| GET     | `/api/auth/me`               | ✓           | Retorna usuário logado                   |
| POST    | `/api/auth/logout`           | ✓           | Limpa cookie de sessão                   |
| GET     | `/api/evaluations`           | ✓           | Lista (LEADER vê próprias, ADMIN vê tudo)|
| GET     | `/api/evaluations/:id`       | ✓           | Detalhe                                  |
| POST    | `/api/evaluations`           | ✓           | Cria — backend recalcula notas           |
| PATCH   | `/api/evaluations/:id`       | ✓           | Edita observações/recommendation         |
| DELETE  | `/api/evaluations/:id`       | ✓ admin     | Remove                                   |
| GET     | `/api/technicians`           | ✓           | Lista (suporta busca `?q=`)              |
| GET     | `/api/technicians/:id`       | ✓           | Detalhe                                  |
| POST    | `/api/technicians`           | ✓ admin     | Cria                                     |
| PATCH   | `/api/technicians/:id`       | ✓ admin     | Edita                                    |
| DELETE  | `/api/technicians/:id`       | ✓ admin     | Soft delete (`active=false`)             |
| GET     | `/api/users`                 | ✓ admin     | Lista usuários                           |
| PATCH   | `/api/users/:id`             | ✓ admin     | Muda role/active                         |

## Segurança aplicada

- **JWT em cookie httpOnly** — imune a XSS
- **`SameSite=lax` + `Secure` em produção** — bloqueia CSRF
- **CSRF state** no fluxo OAuth — cookie temporário comparado no callback
- **Validação dupla do domínio** — `hd` parameter no Google + verificação server-side do `payload.hd` E do sufixo do email
- **`email_verified` obrigatório** — bloqueia contas Google não confirmadas
- **`audience` validado** no `id_token`
- **Re-check do `active`** em toda request — desativar tem efeito imediato
- **Zod** em todos os payloads — não confiar no cliente
- **Backend recalcula** `technicalScore`, `behavioralScore`, `finalScore`, `classification` — o cliente não pode forjar
- **Helmet** + **CORS whitelist** + **rate limit** (300/15min global, 30/15min em auth)
- **`express.json({ limit: '100kb' })`** — bloqueia payloads gigantes
- **Audit log** — login, logout, criação/edição/exclusão registradas com IP e User-Agent
- **Pino redact** — tokens, secrets e cookies nunca aparecem nos logs
- **Prisma** — queries parametrizadas, imune a SQL injection

## Deploy na Vercel

### Opção A — Repositório separado (recomendado)

```bash
cd backend
vercel --prod
```

Configurar na Vercel UI:

1. **Environment Variables** — copiar todas do `.env.example` com valores de produção
2. **Build & Development Settings**
   - Framework: Other
   - Build: `npx prisma generate && tsc`
   - Install: `npm install`
3. **Domain** — `api.sietch-metrics.vercel.app` ou domínio próprio

### Opção B — Mesmo projeto Vercel do frontend

O frontend serve `index.html` na raiz. O `vercel.json` da raiz pode rotear `/api/*` para o backend. Requer pequena reorganização (consultar o blueprint, seção 9).

### Migrations em produção

```bash
DIRECT_URL="<URL_DIRECT_SUPABASE_PROD>" npx prisma migrate deploy
```

Rodar localmente apontando para o DB de produção é a forma mais simples. Para automatizar, configurar GitHub Action (ver blueprint §9.4).

> **Importante (Supabase):** migrations devem usar a `DIRECT_URL` (porta 5432), não o pooler. O PgBouncer em modo Transaction não suporta os comandos DDL que o Prisma executa em `migrate`.

## Comandos

```bash
npm run dev         # Servidor local com watch
npm run build       # Compila TS para dist/ (após prisma generate)
npm run start       # Roda dist/server.js (produção local)
npm run typecheck   # Apenas type-check, sem emit

npm run db:migrate  # Cria/aplica migration em dev
npm run db:deploy   # Aplica migrations em produção (idempotente)
npm run db:studio   # UI gráfica do Prisma
npm run db:seed     # Roda prisma/seed.ts
npm run db:reset    # ⚠️ Reseta o banco (cuidado em prod!)

npm test            # Vitest
```

## Próximos passos sugeridos

1. Criar o projeto no Google Cloud Console e gerar Client ID/Secret
2. Criar o projeto no Supabase, copiar `DATABASE_URL` (Transaction pooler · 6543) e `DIRECT_URL` (Direct · 5432)
3. Preencher `.env`, rodar `npm install` e `npx prisma db push` (sincroniza schema)
4. `npm run dev` e testar `GET /api/auth/google` no navegador
5. Migrar o `index.html` da raiz para usar a API (substituir `localStorage` — ver blueprint §8)
6. Deploy

---

*Sietch Metrics Backend v1.0 — Implementação completa do [SIETCH_METRICS_BACKEND_BLUEPRINT.md](../SIETCH_METRICS_BACKEND_BLUEPRINT.md)*
