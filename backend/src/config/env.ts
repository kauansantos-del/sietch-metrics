import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Database — Supabase
  // DATABASE_URL: pooler (PgBouncer, porta 6543) — usado em runtime
  // DIRECT_URL:   conexão direta (porta 5432) — usado pelo Prisma migrate / db push
  DATABASE_URL: z.string().url().refine(
    (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
    'DATABASE_URL deve ser uma connection string Postgres válida',
  ),
  DIRECT_URL: z.string().url().refine(
    (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
    'DIRECT_URL deve ser uma connection string Postgres válida',
  ),

  // Session
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter no mínimo 32 caracteres'),
  SESSION_COOKIE_NAME: z.string().min(1).default('sietch_session'),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(7),

  // Frontend / CORS
  FRONTEND_URL: z.string().url(),
  ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((s) => s.split(',').map((origin) => origin.trim()).filter(Boolean)),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Bootstrap
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),

  // Supabase Storage (opcional — uploads de capa e vídeo)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('sietch-uploads'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Variáveis de ambiente inválidas:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    throw new Error('Configuração inválida — corrija o .env e tente novamente.');
  }

  return parsed.data;
}

export const env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
