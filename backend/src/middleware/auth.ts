import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { ForbiddenError, UnauthenticatedError } from '../utils/errors';

interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Aceita cookie OU header Authorization: Bearer <token>
  // (Bearer é usado quando frontend e backend estão em origens diferentes — dev cross-port)
  let token: string | undefined = req.cookies[env.SESSION_COOKIE_NAME];

  if (!token) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      token = auth.slice(7).trim();
    }
  }

  if (!token || typeof token !== 'string') {
    return next(new UnauthenticatedError());
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return next(new UnauthenticatedError());
  }

  // Re-verifica que o usuário ainda existe e está ativo.
  // Permite revogação imediata ao desativar uma conta.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true, active: true },
  });

  if (!user) {
    return next(new UnauthenticatedError('Usuário não encontrado'));
  }
  if (!user.active) {
    return next(new ForbiddenError('USER_INACTIVE', 'Sua conta foi desativada'));
  }

  req.user = { userId: user.id, email: user.email, role: user.role };
  return next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthenticatedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('FORBIDDEN_ROLE', 'Permissão insuficiente para esta ação'));
    }
    return next();
  };
}
