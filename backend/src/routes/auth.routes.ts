import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logAudit } from '../middleware/audit';
import { requireAuth } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';
import { sessionCookieOptions, signSessionToken } from '../services/auth.service';

const router = Router();

const DEFAULT_USER_EMAIL = (env.INITIAL_ADMIN_EMAIL ?? 'admin@sietch-metrics.internal').toLowerCase();
const DEFAULT_USER_NAME = 'Admin Sietch Metrics';

async function ensureDefaultUser() {
  let user = await prisma.user.findFirst({ where: { email: DEFAULT_USER_EMAIL } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: `local_${Date.now()}`,
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

// ─── 1. Sessão automática ────────────────────────────────────
// Cria/recupera o usuário padrão e devolve cookie de sessão.
router.post('/session', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await ensureDefaultUser();

    const authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
    };

    const token = signSessionToken(authUser);
    res.cookie(env.SESSION_COOKIE_NAME, token, sessionCookieOptions());

    await logAudit({
      userId: user.id,
      action: 'user.login',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });

    return res.json({ ok: true, user: authUser });
  } catch (err) {
    return next(err);
  }
});

// ─── 2. Usuário atual ────────────────────────────────────────
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

export default router;
