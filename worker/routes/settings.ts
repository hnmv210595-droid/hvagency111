import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { writeAuditLog, jsonError } from '../lib/audit';
import { getSettings, setSetting } from '../lib/settings';
import { parseYearMonth } from '../lib/time';
import { authMiddleware, requireRole } from '../middleware/auth';

export const settingsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
export const reportRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
export const auditRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

settingsRoutes.use('*', authMiddleware);
reportRoutes.use('*', authMiddleware);
auditRoutes.use('*', authMiddleware);

settingsRoutes.get('/', async (c) => {
  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const user = c.get('user');
  // Employees get limited settings
  if (user.role === 'EMPLOYEE') {
    return c.json({
      data: {
        company_name: settings.company_name,
        standard_work_days: settings.standard_work_days,
        paid_leave_days: settings.paid_leave_days,
        currency: settings.currency,
        timezone: settings.timezone,
      },
    });
  }
  return c.json({ data: settings });
});

settingsRoutes.put('/', requireRole('ADMIN'), async (c) => {
  const schema = z.object({
    company_name: z.string().min(1).max(200).optional(),
    company_ips: z.array(z.string().min(7).max(45)).min(1).optional(),
    standard_work_days: z.number().int().min(1).max(31).optional(),
    paid_leave_days: z.number().int().min(0).max(31).optional(),
    default_insurance_rate: z.number().min(0).max(100).optional(),
    currency: z.string().min(1).max(20).optional(),
    timezone: z.string().min(1).max(64).optional(),
  });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const userId = c.get('user').id;
  if (body.company_name != null) await setSetting(c.env.DB, 'company_name', body.company_name, userId);
  if (body.company_ips != null)
    await setSetting(c.env.DB, 'company_ips', JSON.stringify(body.company_ips), userId);
  if (body.standard_work_days != null)
    await setSetting(c.env.DB, 'standard_work_days', String(body.standard_work_days), userId);
  if (body.paid_leave_days != null)
    await setSetting(c.env.DB, 'paid_leave_days', String(body.paid_leave_days), userId);
  if (body.default_insurance_rate != null)
    await setSetting(
      c.env.DB,
      'default_insurance_rate',
      String(body.default_insurance_rate),
      userId,
    );
  if (body.currency != null) await setSetting(c.env.DB, 'currency', body.currency, userId);
  if (body.timezone != null) await setSetting(c.env.DB, 'timezone', body.timezone, userId);

  await writeAuditLog(c.env.DB, {
    userId,
    action: 'UPDATE_SETTINGS',
    targetType: 'settings',
    targetId: 'system',
    ip: c.get('clientIp'),
    metadata: body,
  });

  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  return c.json({ data: settings });
});

reportRoutes.get('/', requireRole('ADMIN'), async (c) => {
  const yearQ = c.req.query('year');
  const monthQ = c.req.query('month');
  let year: number;
  let month: number;
  try {
    ({ year, month } = parseYearMonth(yearQ, monthQ));
  } catch {
    return jsonError('Invalid period', 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT p.*, e.name AS employee_name, e.employee_code, e.department
     FROM payrolls p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.year = ? AND p.month = ?
     ORDER BY e.name ASC`,
  )
    .bind(year, month)
    .all();

  const totals = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS count,
       COALESCE(SUM(base_salary_paid), 0) AS base_salary_paid,
       COALESCE(SUM(revenue), 0) AS revenue,
       COALESCE(SUM(commission), 0) AS commission,
       COALESCE(SUM(gross_income), 0) AS gross_income,
       COALESCE(SUM(social_insurance), 0) AS social_insurance,
       COALESCE(SUM(other_deductions), 0) AS other_deductions,
       COALESCE(SUM(net_salary), 0) AS net_salary,
       COALESCE(SUM(paid_days), 0) AS paid_days
     FROM payrolls WHERE year = ? AND month = ?`,
  )
    .bind(year, month)
    .first();

  return c.json({ period: { year, month }, data: results ?? [], totals });
});

auditRoutes.get('/', requireRole('ADMIN'), async (c) => {
  const action = c.req.query('action');
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50)));
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (action) {
    clauses.push('a.action = ?');
    binds.push(action);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM audit_logs a ${where}`)
    .bind(...binds)
    .first<{ cnt: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT a.*, u.username
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.timestamp DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all();

  return c.json({ data: results ?? [], total: totalRow?.cnt ?? 0, page, limit });
});
