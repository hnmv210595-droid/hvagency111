import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import type { Env, Variables } from '../env';
import { SESSION_COOKIE } from '../../shared/constants';
import { getSessionSecret, jsonError } from '../lib/audit';
import { randomId, randomToken, sha256Hex } from '../lib/crypto';
import { getClientIp } from '../lib/ip';
import { nowInTimezone } from '../lib/time';

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

export async function createSession(
  c: AppContext,
  userId: string,
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(`${getSessionSecret(c.env)}:${token}`);
  const ttlHours = Number(c.env.SESSION_TTL_HOURS ?? 24);
  const expires = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const id = randomId();
  const ip = getClientIp(c.req.raw);
  const ua = c.req.header('user-agent') ?? null;

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, tokenHash, expires, ip, ua, nowInTimezone())
    .run();

  const isSecure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax',
    path: '/',
    maxAge: ttlHours * 60 * 60,
  });

  return id;
}

export async function destroySession(c: AppContext): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(`${getSessionSecret(c.env)}:${token}`);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function authMiddleware(c: AppContext, next: Next) {
  const ip = getClientIp(c.req.raw);
  c.set('clientIp', ip);

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return jsonError('Unauthorized', 401);
  }

  let tokenHash: string;
  try {
    tokenHash = await sha256Hex(`${getSessionSecret(c.env)}:${token}`);
  } catch {
    return jsonError('Server misconfigured', 500);
  }

  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.username, u.email, u.role, u.status, u.employee_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{
      session_id: string;
      expires_at: string;
      id: string;
      username: string;
      email: string | null;
      role: 'ADMIN' | 'EMPLOYEE';
      status: 'ACTIVE' | 'DISABLED';
      employee_id: string | null;
    }>();

  if (!row) {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return jsonError('Unauthorized', 401);
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(row.session_id).run();
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return jsonError('Session expired', 401);
  }

  if (row.status !== 'ACTIVE') {
    return jsonError('Account disabled', 403);
  }

  c.set('sessionId', row.session_id);
  c.set('user', {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status,
    employee_id: row.employee_id,
  });

  await next();
}

export function requireRole(...roles: Array<'ADMIN' | 'EMPLOYEE'>) {
  return async (c: AppContext, next: Next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return jsonError('Forbidden', 403);
    }
    await next();
  };
}

/** Employee may only access own employee_id resources. */
export function assertOwnEmployee(c: AppContext, employeeId: string): boolean {
  const user = c.get('user');
  if (user.role === 'ADMIN') return true;
  return user.employee_id === employeeId;
}
