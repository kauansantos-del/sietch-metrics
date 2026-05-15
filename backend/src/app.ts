import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { env, isProduction } from './config/env';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

import authRoutes from './routes/auth.routes';
import criteriaRoutes from './routes/criteria.routes';
import evaluationRoutes from './routes/evaluations.routes';
import technicianRoutes from './routes/technicians.routes';
import userRoutes from './routes/users.routes';
import trainingRoutes from './routes/trainings.routes';
import assignmentRoutes from './routes/assignments.routes';
import playerRoutes from './routes/player.routes';
import colaboradorRoutes from './routes/colaborador.routes';
import adminRoutes from './routes/admin.routes';
import uploadsRoutes from './routes/uploads.routes';

const app = express();

// Vercel injeta o IP real em X-Forwarded-For
app.set('trust proxy', 1);

// Segurança — Helmet com defaults sensatos
app.use(
  helmet({
    contentSecurityPolicy: false, // API JSON, sem HTML — não precisa de CSP
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS com whitelist explícita + credenciais (cookies)
app.use(
  cors({
    origin: (origin, callback) => {
      // Requests sem Origin (curl, server-to-server) sempre permitidos
      if (!origin) return callback(null, true);
      if (env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS bloqueado para origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Logger HTTP — JSON estruturado em produção
app.use(pinoHttp({ logger }));

// ─── Rate limiting ────────────────────────────────────────
// Global — protege a API inteira
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health',
  }),
);

// Mais agressivo no fluxo de auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// ─── Health check ─────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, env: env.NODE_ENV, timestamp: new Date().toISOString() });
});

// ─── Rotas ────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/criteria', criteriaRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/colaborador', colaboradorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadsRoutes);

// 404 + error handler — sempre por último
app.use('/api', notFoundHandler);
app.use(errorHandler);

if (!isProduction) {
  logger.info({ allowedOrigins: env.ALLOWED_ORIGINS }, 'Sietch Metrics API inicializada');
}

export default app;
