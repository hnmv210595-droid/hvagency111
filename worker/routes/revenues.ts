import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { writeAuditLog, jsonError } from '../lib/audit';
import { randomId } from '../lib/crypto';
import { nowInTimezone, parseYearMonth } from '../lib/time';
import { authMiddleware, requireRole } from '../middleware/auth';

export const revenueRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

revenueRoutes.use('*', authMiddleware);

revenueRoutes.get('/', async (c) => {
  const user = c.get('user');
  const employeeId = c.req.query('employee_id');
  const year = c.req.query('year');
  const month = c.req.query('month');
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)));
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (user.role === 'EMPLOYEE') {
    if (!user.employee_id) return jsonError('No employee profile', 404);
    clauses.push('r.employee_id = ?');
    binds.push(user.employee_id);
  } else if (employeeId) {
    clauses.push('r.employee_id = ?');
    binds.push(employeeId);
  }

  if (year) {
    clauses.push('r.year = ?');
    binds.push(Number(year));
  }
  if (month) {
    clauses.push('r.month = ?');
    binds.push(Number(month));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM revenues r ${where}`)
    .bind(...binds)
    .first<{ cnt: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT r.*, e.name AS employee_name, e.employee_code, e.commission_rate
     FROM revenues r
     JOIN employees e ON e.id = r.employee_id
     ${where}
     ORDER BY r.year DESC, r.month DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all();

  return c.json({ data: results ?? [], total: totalRow?.cnt ?? 0, page, limit });
});

const revenueSchema = z.object({
  employee_id: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().min(0),
  note: z.string().max(500).nullable().optional(),
});

revenueRoutes.post('/', requireRole('ADMIN'), async (c) => {
  let body: z.infer<typeof revenueSchema>;
  try {
    body = revenueSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  parseYearMonth(body.year, body.month);
  const now = nowInTimezone();
  const id = randomId();

  try {
    await c.env.DB.prepare(
      `INSERT INTO revenues (id, employee_id, year, month, amount, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, year, month) DO UPDATE SET
         amount = excluded.amount,
         note = excluded.note,
         updated_at = excluded.updated_at`,
    )
      .bind(id, body.employee_id, body.year, body.month, body.amount, body.note ?? null, now, now)
      .run();
  } catch (e) {
    return jsonError('Failed to save revenue', 400, String(e));
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM revenues WHERE employee_id = ? AND year = ? AND month = ?',
  )
    .bind(body.employee_id, body.year, body.month)
    .first<{ id: string }>();

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'UPDATE_REVENUE',
    targetType: 'revenue',
    targetId: row?.id ?? id,
    ip: c.get('clientIp'),
    metadata: body,
  });

  return c.json({ data: row }, 201);
});

revenueRoutes.put('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const schema = z.object({
    amount: z.number().min(0),
    note: z.string().max(500).nullable().optional(),
  });
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM revenues WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) return jsonError('Not found', 404);

  await c.env.DB.prepare(
    'UPDATE revenues SET amount = ?, note = ?, updated_at = ? WHERE id = ?',
  )
    .bind(body.amount, body.note ?? null, nowInTimezone(), id)
    .run();

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'UPDATE_REVENUE',
    targetType: 'revenue',
    targetId: id,
    ip: c.get('clientIp'),
    metadata: body,
  });

  const row = await c.env.DB.prepare('SELECT * FROM revenues WHERE id = ?').bind(id).first();
  return c.json({ data: row });
});
