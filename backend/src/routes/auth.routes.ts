// Auth — login por email (sem Google OAuth)
//
// Para tools internos. Em produção, considere adicionar password ou magic link.
// Esta versão considera login válido se o email existir no banco e o user estiver ativo.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logAudit } from '../middleware/audit';
import { requireAuth } from '../middleware/auth';
import { NotFoundError, UnauthenticatedError } from '../utils/errors';
import { sessionCookieOptions, signSessionToken } from '../services/auth.service';

const router = Router();

const DEFAULT_USER_EMAIL = (env.INITIAL_ADMIN_EMAIL ?? 'admin@sietch-metrics.internal').toLowerCase();
const DEFAULT_USER_NAME = 'Admin Sietch Metrics';

async function ensureDefaultUser() {
  let user = await prisma.user.findFirst({ where: { email: DEFAULT_USER_EMAIL } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: DEFAULT_USER_EMAIL,
        name: DEFAULT_USER_NAME,
        role: 'SUPER_ADMIN',
        active: true,
        lastLoginAt: new Date(),
      },
    });
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  }

  return user;
}

function issueSession(res: Response, user: { id: string; email: string; name: string; picture: string | null; role: 'SUPER_ADMIN' | 'ADMIN' }) {
  const token = signSessionToken({ ...user });
  res.cookie(env.SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return user;
}

// ─── Login por email ─────────────────────────────────────────

const loginSchema = z.object({ email: z.string().email().toLowerCase() });

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthenticatedError('Email não encontrado');
    if (!user.active) throw new UnauthenticatedError('Usuário inativo');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    issueSession(res, {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
    });

    await logAudit({
      userId: user.id,
      action: 'user.login',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Sessão automática (admin padrão) ────────────────────────
// Mantido para fluxos de bootstrap. Não-protegido.

router.post('/session', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await ensureDefaultUser();

    issueSession(res, {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
    });

    await logAudit({
      userId: user.id,
      action: 'user.login',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Logout ──────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.clearCookie(env.SESSION_COOKIE_NAME, sessionCookieOptions());
    await logAudit({
      userId: req.user!.userId,
      action: 'user.logout',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Usuário atual ───────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        picture: true,
        role: true,
        lastLoginAt: true,
      },
    });
    if (!user) throw new NotFoundError('Usuário não encontrado');
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ─── Lista de usuários disponíveis para login (modo dev) ─────
// Apenas em desenvolvimento. Útil para a tela de login mostrar dropdown.

router.get('/users-for-login', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.json({ users: [] });
      return;
    }
    const users = await prisma.user.findMany({
      where: { active: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { email: true, name: true, role: true },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

export default router;
