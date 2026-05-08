# Sietch Metrics — Backend

API REST da plataforma Sietch Metrics — avaliação de performance de técnicos de TI.

**Banco:** Supabase (PostgreSQL) — já configurado e com dados de seed  
**Deploy:** Vercel Serverless Functions  
**Repositório:** [github.com/kauansantos-del/sietch-metrics](https://github.com/kauansantos-del/sietch-metrics)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20 LTS + TypeScript |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Banco | PostgreSQL via Supabase |
| Auth | Google OAuth 2.0 + JWT em cookie httpOnly |
| Deploy | Vercel Serverless Functions |

---

## Estrutura

```
backend/
├── api/
│   └── index.ts              # Entry serverless (Vercel)
├── prisma/
│   ├── schema.prisma         # Modelo de dados
│   └── seed.ts               # Dados iniciais (4 admins + 35 técnicos + 70 avaliações)
├── src/
│   ├── app.ts                # Express app (helmet, cors, rate-limit, rotas)
│   ├── server.ts             # Entry local (tsx watch)
│   ├── config/               # env (zod), prisma, google
│   ├── middleware/           # auth, audit, error-handler
│   ├── routes/               # auth, evaluations, technicians, users
│   ├── services/             # lógica de negócio
│   ├── schemas/              # validação Zod dos DTOs
│   ├── utils/                # errors, classification, logger
│   └── types/express.d.ts    # extensão tipada do Request
├── .env.example              # Template — copiar para .env
├── tsconfig.json
├── vercel.json
└── package.json
```

---

## Setup para novo dev

### Pré-requisitos

- Node.js 20+
- Acesso ao Supabase do projeto (pedir ao responsável: `kauancarvalhomk@gmail.com`)

---

### 1. Clonar e entrar na pasta

```bash
git clone https://github.com/kauansantos-del/sietch-metrics.git
cd sietch-metrics/backend
```

---

### 2. Instalar dependências

```bash
npm install
```

---

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Abrir o `.env` e preencher os 3 campos marcados com `FILL_ME`:

| Variável | Onde encontrar |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → **Transaction pooler** (porta 6543) |
| `DIRECT_URL` | Supabase → Settings → Database → **Direct connection** (porta 5432) |
| `JWT_SECRET` | Gerar com `openssl rand -base64 64` |

> **Atenção:** se a senha do banco contiver `@`, substitua por `%40` na URL.
>
> Exemplo: senha `abc@123` → URL usa `abc%40123`

---

### 4. Sincronizar o schema com o banco

```bash
npx prisma db push
```

> Use `db push` (não `db migrate`) — é o comando correto para sincronizar o schema
> em ambiente não-interativo (terminal que não suporta prompts).

---

### 5. Popular o banco com dados iniciais (opcional)

O banco de produção já tem dados. Só rode o seed se estiver usando um banco limpo:

```bash
npm run db:seed
```

Isso cria:
- 4 usuários avaliadores (SUPER_ADMIN + 3 ADMIN)
- 35 técnicos distribuídos por área (Dev, Design, Front-end, Back-end, Outros)
- 70 avaliações (2 ciclos × 35 técnicos)

---

### 6. Rodar em desenvolvimento

```bash
npm run dev
```

API disponível em `http://localhost:3000`

Verificar se está rodando:

```bash
curl http://localhost:3000/api/health
# {"ok":true,"env":"development","timestamp":"..."}
```

---

### 7. Visualizar o banco (opcional)

```bash
npm run db:studio
```

Abre o Prisma Studio em `http://localhost:5555` — interface gráfica para ver e editar os dados.

---

## Endpoints

Base URL local: `http://localhost:3000`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/health` | — | Health check |
| GET | `/api/auth/google` | — | Inicia fluxo OAuth Google |
| GET | `/api/auth/google/callback` | — | Recebe code, valida domínio, emite JWT |
| GET | `/api/auth/me` | ✓ | Retorna usuário logado |
| POST | `/api/auth/logout` | ✓ | Limpa cookie de sessão |
| GET | `/api/evaluations` | ✓ | Lista avaliações |
| GET | `/api/evaluations/:id` | ✓ | Detalhe de avaliação |
| POST | `/api/evaluations` | ✓ | Cria avaliação (backend recalcula notas) |
| PATCH | `/api/evaluations/:id` | ✓ | Edita observações |
| DELETE | `/api/evaluations/:id` | ✓ admin | Remove avaliação |
| GET | `/api/technicians` | ✓ | Lista técnicos (suporta `?q=` para busca) |
| GET | `/api/technicians/:id` | ✓ | Detalhe de técnico |
| POST | `/api/technicians` | ✓ admin | Cria técnico |
| PATCH | `/api/technicians/:id` | ✓ admin | Edita técnico |
| DELETE | `/api/technicians/:id` | ✓ admin | Soft delete (`active=false`) |
| GET | `/api/users` | ✓ admin | Lista usuários avaliadores |
| PATCH | `/api/users/:id` | ✓ admin | Altera role/active |

---

## Comandos disponíveis

```bash
npm run dev          # Servidor local com hot-reload
npm run build        # Compila TS para dist/
npm run start        # Roda dist/server.js (produção local)
npm run typecheck    # Type-check sem emit

npx prisma db push   # Sincroniza schema com o banco (usar no setup inicial)
npm run db:deploy    # Aplica migrations em produção (idempotente)
npm run db:studio    # Interface gráfica do banco
npm run db:seed      # Popula o banco com dados iniciais
npm run db:reset     # ⚠️  Reseta o banco — CUIDADO em produção

npm test             # Vitest
```

---

## Deploy na Vercel

```bash
cd backend
vercel --prod
```

Configurar na Vercel:
1. **Environment Variables** — copiar todas as variáveis do `.env` com valores de produção
2. **Build Command** — `npx prisma generate && tsc`
3. **Install Command** — `npm install`

Para rodar migrations em produção:

```bash
DIRECT_URL="<URL_DIRECT_SUPABASE_PROD>" npx prisma migrate deploy
```

---

## Segurança

- JWT em cookie `httpOnly` — imune a XSS
- `SameSite=lax` + `Secure` em produção — proteção CSRF
- CSRF state no fluxo OAuth
- Validação de domínio Google dupla (parâmetro `hd` + verificação server-side)
- `email_verified` obrigatório
- Re-check do campo `active` em toda request
- Zod em todos os payloads de entrada
- Notas recalculadas no backend — cliente não pode forjar scores
- Helmet + CORS whitelist + rate limit (300/15min global, 30/15min em auth)
- Queries parametrizadas via Prisma — sem SQL injection
- Audit log de todas as ações sensíveis

---

*Sietch Metrics Backend v1.0 — contato: kauancarvalhomk@gmail.com*
