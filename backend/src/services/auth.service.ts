import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { UserRole } from '@prisma/client';
import { env, isProduction } from '../config/env';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  role: UserRole;
}

export function signSessionToken(user: AuthenticatedUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: `${env.SESSION_MAX_AGE_DAYS}d` },
  );
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
