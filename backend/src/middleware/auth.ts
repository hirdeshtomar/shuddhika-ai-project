import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { AuthenticatedRequest, ApiResponse } from '../types/index.js';

interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

// ============================================================
// AUTH DISABLED (temporary): every request acts as the owner.
// To restore login: set to false, redeploy backend, and restore
// the login flow in frontend/src/App.tsx (see AUTH DISABLED there).
// ============================================================
export const AUTH_DISABLED = true;

const SYSTEM_USER_EMAIL = 'owner@shuddhika.local';
let systemUserId: string | null = null;

/** Get (or create once) the user record all requests run as while auth is off. */
async function getSystemUserId(): Promise<string> {
  if (systemUserId) return systemUserId;
  const user = await prisma.user.upsert({
    where: { email: SYSTEM_USER_EMAIL },
    update: {},
    create: {
      email: SYSTEM_USER_EMAIL,
      // Not a valid bcrypt hash — this account can never log in via password
      password: 'LOGIN_DISABLED',
      name: 'Shuddhika Owner',
      role: 'ADMIN',
    },
  });
  systemUserId = user.id;
  return user.id;
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): void {
  if (AUTH_DISABLED) {
    getSystemUserId()
      .then((id) => {
        req.user = { id, email: SYSTEM_USER_EMAIL, role: 'ADMIN' };
        next();
      })
      .catch(next);
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Please provide a valid token.',
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token.',
    });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: 'Admin access required.',
    });
    return;
  }
  next();
}

export function generateToken(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
  );
}
