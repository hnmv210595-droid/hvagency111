import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { writeAuditLog, jsonError, getSessionSecret } from '../lib/audit';
import { verifyPassword, randomId } from '../lib/crypto';
import { getClientIp, isIpAllowed, parseCompanyIps } from '../lib/ip';
import { getSettings } from '../lib/settings';
import { nowInTimezone } from '../lib/time';
import { authMiddleware, createSession, destroySession } from '../middleware/auth';

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoutes.post('/login', async (c) => {
  let body: z.infer<typeof loginSchema>;
  try {
    body = loginSchema.parse(await c.req.json());
  } catch {
    return jsonError('Invalid credentials payload', 400);
  }

  const ip = getClientIp(c.req.raw);
  const username = body.username.trim();

  // Rate limit
  const limit = Number(c.env.LOGIN_RATE_LIMIT ?? 10);
  const windowMin = Number(c.env.LOGIN_RATE_WINDOW_MINUTES ?? 15);
  const windowStart = new Date(Date.now() - windowMin * 60 * 1000).toISOString();

  const attemptCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM login_attempts
     WHERE username = ? AND ip = ? AND success = 0 AND created_at >= ?`,
  )
    .bind(username, ip, windowStart)
    .first<{ cnt: number }>();

  if ((attemptCount?.cnt ?? 0) >= limit) {
    return jsonError('Too many login attempts. Try again later.', 429);
  }

  const user = await c.env.DB.prepare(
    `SELECT id, username, email, password_hash, role, status, employee_id
     FROM users WHERE username = ? COLLATE NOCASE`,
  )
    .bind(username)
    .first<{
      id: string;
      username: string;
      email: string | null;
      password_hash: string;
      role: 'ADMIN' | 'EMPLOYEE';
      status: 'ACTIVE' | 'DISABLED';
      employee_id: string | null;
    }>();

  const recordAttempt = async (success: boolean) => {
    await c.env.DB.prepare(
      `INSERT INTO login_attempts (id, username, ip, success, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(randomId(), username, ip, success ? 1 : 0, nowInTimezone())
      .run();
  };

  if (!user || user.status !== 'ACTIVE') {
    await recordAttempt(false);
    return jsonError('Invalid username or password', 401);
  }

  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok) {
    await recordAttempt(false);
    return jsonError('Invalid username or password', 401);
  }

  // IP restriction for employees (server-side)
  if (user.role === 'EMPLOYEE') {
    const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
    const allowed = parseCompanyIps(c.env.COMPANY_IP, settings.company_ips);
    if (!isIpAllowed(ip, allowed)) {
      await recordAttempt(false);
      await writeAuditLog(c.env.DB, {
        userId: user.id,
        action: 'LOGIN',
        targetType: 'user',
        targetId: user.id,
        ip,
        metadata: { success: false, reason: 'IP_RESTRICTED', ip },
        timezone: settings.timezone,
      });
      return jsonError('Employee login is only allowed from company network', 403);
    }
  }

  try {
    getSessionSecret(c.env);
  } catch {
    return jsonError('Server misconfigured', 500);
  }

  await createSession(c, user.id);
  await recordAttempt(true);
  await writeAuditLog(c.env.DB, {
    userId: user.id,
    action: 'LOGIN',
    targetType: 'user',
    targetId: user.id,
    ip,
    metadata: { success: true, role: user.role },
  });

  return c.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      employee_id: user.employee_id,
    },
  });
});

authRoutes.post('/logout', authMiddleware, async (c) => {
  const user = c.get('user');
  const ip = c.get('clientIp');
  await writeAuditLog(c.env.DB, {
    userId: user.id,
    action: 'LOGOUT',
    targetType: 'user',
    targetId: user.id,
    ip,
  });
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  let employee = null;
  if (user.employee_id) {
    employee = await c.env.DB.prepare(
      `SELECT id, name, employee_code, department, position FROM employees WHERE id = ?`,
    )
      .bind(user.employee_id)
      .first();
  }
  return c.json({ user: { ...user, employee } });
});
