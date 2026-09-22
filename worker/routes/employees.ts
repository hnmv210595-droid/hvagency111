import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { writeAuditLog, jsonError } from '../lib/audit';
import { hashPassword, randomId } from '../lib/crypto';
import { getSettings } from '../lib/settings';
import { nowInTimezone } from '../lib/time';
import { authMiddleware, requireRole } from '../middleware/auth';

const employeeSchema = z.object({
  employee_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  username: z.string().min(3).max(100),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(30).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  position: z.string().max(100).optional().nullable(),
  start_date: z.string().max(20).optional().nullable(),
  base_salary: z.number().min(0),
  commission_rate: z.number().min(0).max(100),
  insurance_rate: z.number().min(0).max(100).optional(),
  insurance_base: z.number().min(0).optional(),
  password: z.string().min(8).max(200).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

export const employeeRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

employeeRoutes.use('*', authMiddleware);

employeeRoutes.get('/', async (c) => {
  const user = c.get('user');
  const q = c.req.query('q')?.trim();
  const status = c.req.query('status');
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));
  const offset = (page - 1) * limit;

  if (user.role === 'EMPLOYEE') {
    if (!user.employee_id) return jsonError('No employee profile', 404);
    const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?')
      .bind(user.employee_id)
      .first();
    return c.json({ data: emp ? [emp] : [], total: emp ? 1 : 0, page: 1, limit: 1 });
  }

  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    clauses.push('(name LIKE ? OR employee_code LIKE ? OR username LIKE ? OR email LIKE ?)');
    const like = `%${q}%`;
    binds.push(like, like, like, like);
  }
  if (status === 'ACTIVE' || status === 'DISABLED') {
    clauses.push('status = ?');
    binds.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM employees ${where}`)
    .bind(...binds)
    .first<{ cnt: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM employees ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all();

  return c.json({ data: results ?? [], total: totalRow?.cnt ?? 0, page, limit });
});

employeeRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (user.role === 'EMPLOYEE' && user.employee_id !== id) {
    return jsonError('Forbidden', 403);
  }
  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first();
  if (!emp) return jsonError('Not found', 404);
  return c.json({ data: emp });
});

employeeRoutes.post('/', requireRole('ADMIN'), async (c) => {
  let body: z.infer<typeof employeeSchema>;
  try {
    body = employeeSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }
  if (!body.password) {
    return jsonError('Password is required when creating employee', 400);
  }

  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const now = nowInTimezone(settings.timezone);
  const employeeId = randomId();
  const userId = randomId();
  const passwordHash = await hashPassword(body.password);
  const insuranceRate = body.insurance_rate ?? settings.default_insurance_rate;
  const insuranceBase = body.insurance_base ?? 0;

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users (id, username, email, password_hash, role, status, employee_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'EMPLOYEE', 'ACTIVE', ?, ?, ?)`,
      ).bind(
        userId,
        body.username.trim(),
        body.email || null,
        passwordHash,
        employeeId,
        now,
        now,
      ),
      c.env.DB.prepare(
        `INSERT INTO employees (
           id, employee_code, name, username, email, phone, department, position, start_date,
           base_salary, commission_rate, insurance_rate, insurance_base, status, user_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      ).bind(
        employeeId,
        body.employee_code.trim(),
        body.name.trim(),
        body.username.trim(),
        body.email || null,
        body.phone ?? null,
        body.department ?? null,
        body.position ?? null,
        body.start_date ?? null,
        body.base_salary,
        body.commission_rate,
        insuranceRate,
        insuranceBase,
        userId,
        now,
        now,
      ),
    ]);
  } catch (e) {
    const msg = String(e);
    if (msg.includes('UNIQUE')) {
      return jsonError('Username or employee code already exists', 409);
    }
    throw e;
  }

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'CREATE_USER',
    targetType: 'employee',
    targetId: employeeId,
    ip: c.get('clientIp'),
    metadata: { username: body.username, employee_code: body.employee_code },
  });

  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(employeeId)
    .first();
  return c.json({ data: emp }, 201);
});

employeeRoutes.put('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id)
    .first<{
      id: string;
      user_id: string | null;
      base_salary: number;
      commission_rate: number;
      insurance_rate: number;
      insurance_base: number;
      status: string;
    }>();
  if (!existing) return jsonError('Not found', 404);

  const updateSchema = employeeSchema.omit({ password: true }).extend({
    password: z.string().min(8).max(200).optional(),
  });
  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const now = nowInTimezone();
  const status = body.status ?? 'ACTIVE';

  await c.env.DB.prepare(
    `UPDATE employees SET
       employee_code = ?, name = ?, username = ?, email = ?, phone = ?,
       department = ?, position = ?, start_date = ?,
       base_salary = ?, commission_rate = ?, insurance_rate = ?, insurance_base = ?,
       status = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      body.employee_code.trim(),
      body.name.trim(),
      body.username.trim(),
      body.email || null,
      body.phone ?? null,
      body.department ?? null,
      body.position ?? null,
      body.start_date ?? null,
      body.base_salary,
      body.commission_rate,
      body.insurance_rate ?? existing.insurance_rate,
      body.insurance_base ?? existing.insurance_base,
      status,
      now,
      id,
    )
    .run();

  if (existing.user_id) {
    await c.env.DB.prepare(
      `UPDATE users SET username = ?, email = ?, status = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(body.username.trim(), body.email || null, status, now, existing.user_id)
      .run();
  }

  const salaryChanged =
    existing.base_salary !== body.base_salary ||
    existing.commission_rate !== body.commission_rate ||
    existing.insurance_rate !== (body.insurance_rate ?? existing.insurance_rate) ||
    existing.insurance_base !== (body.insurance_base ?? existing.insurance_base);

  if (salaryChanged) {
    await writeAuditLog(c.env.DB, {
      userId: c.get('user').id,
      action: 'UPDATE_SALARY',
      targetType: 'employee',
      targetId: id,
      ip: c.get('clientIp'),
      metadata: {
        base_salary: body.base_salary,
        commission_rate: body.commission_rate,
        insurance_rate: body.insurance_rate,
        insurance_base: body.insurance_base,
      },
    });
  }

  if (status === 'DISABLED' && existing.status !== 'DISABLED') {
    await writeAuditLog(c.env.DB, {
      userId: c.get('user').id,
      action: 'DISABLE_USER',
      targetType: 'employee',
      targetId: id,
      ip: c.get('clientIp'),
    });
  } else {
    await writeAuditLog(c.env.DB, {
      userId: c.get('user').id,
      action: 'UPDATE_USER',
      targetType: 'employee',
      targetId: id,
      ip: c.get('clientIp'),
    });
  }

  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first();
  return c.json({ data: emp });
});

employeeRoutes.post('/:id/reset-password', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const schema = z.object({ password: z.string().min(8).max(200) });
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await c.req.json());
  } catch {
    return jsonError('Invalid password', 400);
  }

  const emp = await c.env.DB.prepare('SELECT user_id FROM employees WHERE id = ?')
    .bind(id)
    .first<{ user_id: string | null }>();
  if (!emp?.user_id) return jsonError('Not found', 404);

  const passwordHash = await hashPassword(body.password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, nowInTimezone(), emp.user_id)
    .run();
  // Invalidate sessions
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(emp.user_id).run();

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'RESET_PASSWORD',
    targetType: 'employee',
    targetId: id,
    ip: c.get('clientIp'),
  });

  return c.json({ ok: true });
});

employeeRoutes.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const emp = await c.env.DB.prepare('SELECT user_id FROM employees WHERE id = ?')
    .bind(id)
    .first<{ user_id: string | null }>();
  if (!emp) return jsonError('Not found', 404);

  const now = nowInTimezone();
  await c.env.DB.prepare('UPDATE employees SET status = ?, updated_at = ? WHERE id = ?')
    .bind('DISABLED', now, id)
    .run();
  if (emp.user_id) {
    await c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
      .bind('DISABLED', now, emp.user_id)
      .run();
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(emp.user_id).run();
  }

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'DISABLE_USER',
    targetType: 'employee',
    targetId: id,
    ip: c.get('clientIp'),
  });

  return c.json({ ok: true });
});
