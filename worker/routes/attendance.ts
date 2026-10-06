import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { writeAuditLog, jsonError } from '../lib/audit';
import { randomId } from '../lib/crypto';
import { getSettings } from '../lib/settings';
import { nowInTimezone, todayInTimezone, monthDateRange, parseYearMonth } from '../lib/time';
import { authMiddleware, requireRole } from '../middleware/auth';

export const attendanceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

attendanceRoutes.use('*', authMiddleware);

attendanceRoutes.get('/', async (c) => {
  const user = c.get('user');
  const employeeId = c.req.query('employee_id');
  const year = c.req.query('year');
  const month = c.req.query('month');
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50)));
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (user.role === 'EMPLOYEE') {
    if (!user.employee_id) return jsonError('No employee profile', 404);
    clauses.push('a.employee_id = ?');
    binds.push(user.employee_id);
  } else if (employeeId) {
    clauses.push('a.employee_id = ?');
    binds.push(employeeId);
  }

  if (year && month) {
    try {
      const ym = parseYearMonth(year, month);
      const range = monthDateRange(ym.year, ym.month);
      clauses.push('a.date >= ? AND a.date <= ?');
      binds.push(range.start, range.end);
    } catch {
      return jsonError('Invalid year/month', 400);
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM attendance a ${where}`)
    .bind(...binds)
    .first<{ cnt: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT a.*, e.name AS employee_name, e.employee_code
     FROM attendance a
     JOIN employees e ON e.id = a.employee_id
     ${where}
     ORDER BY a.date DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all();

  return c.json({ data: results ?? [], total: totalRow?.cnt ?? 0, page, limit });
});

attendanceRoutes.post('/check-in', async (c) => {
  const user = c.get('user');
  if (user.role !== 'EMPLOYEE' || !user.employee_id) {
    return jsonError('Only employees can check in', 403);
  }

  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const date = todayInTimezone(settings.timezone);
  const now = nowInTimezone(settings.timezone);
  const ip = c.get('clientIp');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
  )
    .bind(user.employee_id, date)
    .first<{ id: string; check_in: string | null }>();

  if (existing?.check_in) {
    return jsonError('Already checked in today', 409);
  }

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE attendance SET check_in = ?, status = 'PRESENT', ip = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(now, ip, now, existing.id)
      .run();
    const row = await c.env.DB.prepare('SELECT * FROM attendance WHERE id = ?')
      .bind(existing.id)
      .first();
    return c.json({ data: row });
  }

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO attendance (id, employee_id, date, check_in, check_out, status, ip, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 'PRESENT', ?, NULL, ?, ?)`,
  )
    .bind(id, user.employee_id, date, now, ip, now, now)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM attendance WHERE id = ?').bind(id).first();
  return c.json({ data: row }, 201);
});

attendanceRoutes.post('/check-out', async (c) => {
  const user = c.get('user');
  if (user.role !== 'EMPLOYEE' || !user.employee_id) {
    return jsonError('Only employees can check out', 403);
  }

  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const date = todayInTimezone(settings.timezone);
  const now = nowInTimezone(settings.timezone);
  const ip = c.get('clientIp');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
  )
    .bind(user.employee_id, date)
    .first<{ id: string; check_in: string | null; check_out: string | null }>();

  if (!existing?.check_in) {
    return jsonError('Must check in before check out', 400);
  }
  if (existing.check_out) {
    return jsonError('Already checked out today', 409);
  }

  await c.env.DB.prepare(
    `UPDATE attendance SET check_out = ?, ip = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(now, ip, now, existing.id)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM attendance WHERE id = ?')
    .bind(existing.id)
    .first();
  return c.json({ data: row });
});

const employeeMarkSchema = z.object({
  status: z.enum(['PAID_LEAVE', 'UNPAID_LEAVE']),
  note: z.string().max(500).nullable().optional(),
});

/** Employee self-mark paid/unpaid leave for today only. */
attendanceRoutes.post('/mark', async (c) => {
  const user = c.get('user');
  if (user.role !== 'EMPLOYEE' || !user.employee_id) {
    return jsonError('Only employees can mark leave', 403);
  }

  let body: z.infer<typeof employeeMarkSchema>;
  try {
    body = employeeMarkSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const date = todayInTimezone(settings.timezone);
  const now = nowInTimezone(settings.timezone);
  const ip = c.get('clientIp');

  const existing = await c.env.DB.prepare(
    'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
  )
    .bind(user.employee_id, date)
    .first<{ id: string; check_out: string | null }>();

  if (existing?.check_out) {
    return jsonError('Cannot change status after check-out', 409);
  }

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE attendance SET status = ?, check_in = NULL, check_out = NULL, ip = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(body.status, ip, body.note ?? null, now, existing.id)
      .run();
    const row = await c.env.DB.prepare('SELECT * FROM attendance WHERE id = ?')
      .bind(existing.id)
      .first();
    return c.json({ data: row });
  }

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO attendance (id, employee_id, date, check_in, check_out, status, ip, note, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.employee_id, date, body.status, ip, body.note ?? null, now, now)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM attendance WHERE id = ?').bind(id).first();
  return c.json({ data: row }, 201);
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ dạng HH:mm');

const makeupRequestSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    check_in: timeSchema,
    check_out: timeSchema.nullable().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((v) => !v.check_out || v.check_out > v.check_in, {
    message: 'Giờ ra phải sau giờ vào',
    path: ['check_out'],
  });

function previousMonthStart(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}-01`;
}

/** Employee submits a make-up attendance request (needs admin approval). */
attendanceRoutes.post('/requests', async (c) => {
  const user = c.get('user');
  if (user.role !== 'EMPLOYEE' || !user.employee_id) {
    return jsonError('Only employees can request make-up attendance', 403);
  }

  let body: z.infer<typeof makeupRequestSchema>;
  try {
    body = makeupRequestSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const today = todayInTimezone(settings.timezone);
  if (body.date > today) {
    return jsonError('Không thể điểm danh bù cho ngày trong tương lai', 400);
  }
  if (body.date < previousMonthStart(today)) {
    return jsonError('Chỉ điểm danh bù trong tháng này hoặc tháng trước', 400);
  }

  const attended = await c.env.DB.prepare(
    `SELECT check_in FROM attendance WHERE employee_id = ? AND date = ?`,
  )
    .bind(user.employee_id, body.date)
    .first<{ check_in: string | null }>();
  if (attended?.check_in) {
    return jsonError('Ngày này đã có check-in', 409);
  }

  const pending = await c.env.DB.prepare(
    `SELECT id FROM attendance_requests WHERE employee_id = ? AND date = ? AND status = 'PENDING'`,
  )
    .bind(user.employee_id, body.date)
    .first();
  if (pending) {
    return jsonError('Ngày này đã có yêu cầu đang chờ duyệt', 409);
  }

  const now = nowInTimezone(settings.timezone);
  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO attendance_requests (id, employee_id, date, check_in, check_out, reason, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
  )
    .bind(
      id,
      user.employee_id,
      body.date,
      `${body.date}T${body.check_in}:00`,
      body.check_out ? `${body.date}T${body.check_out}:00` : null,
      body.reason,
      now,
      now,
    )
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM attendance_requests WHERE id = ?')
    .bind(id)
    .first();
  return c.json({ data: row }, 201);
});

/** Employee: own requests. Admin: all requests, optional ?status= filter. */
attendanceRoutes.get('/requests', async (c) => {
  const user = c.get('user');
  const status = c.req.query('status');

  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (user.role === 'EMPLOYEE') {
    if (!user.employee_id) return jsonError('No employee profile', 404);
    clauses.push('r.employee_id = ?');
    binds.push(user.employee_id);
  }
  if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
    clauses.push('r.status = ?');
    binds.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { results } = await c.env.DB.prepare(
    `SELECT r.*, e.name AS employee_name, e.employee_code
     FROM attendance_requests r
     JOIN employees e ON e.id = r.employee_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT 200`,
  )
    .bind(...binds)
    .all();

  return c.json({ data: results ?? [] });
});

const reviewSchema = z.object({
  review_note: z.string().max(500).nullable().optional(),
});

attendanceRoutes.post('/requests/:id/approve', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  let body: z.infer<typeof reviewSchema> = {};
  try {
    if (c.req.header('content-type')?.includes('application/json')) {
      body = reviewSchema.parse(await c.req.json());
    }
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const req = await c.env.DB.prepare('SELECT * FROM attendance_requests WHERE id = ?')
    .bind(id)
    .first<{
      id: string;
      employee_id: string;
      date: string;
      check_in: string | null;
      check_out: string | null;
      reason: string;
      status: string;
    }>();
  if (!req) return jsonError('Not found', 404);
  if (req.status !== 'PENDING') return jsonError('Yêu cầu đã được xử lý', 409);

  const year = Number(req.date.slice(0, 4));
  const month = Number(req.date.slice(5, 7));
  const locked = await c.env.DB.prepare(
    `SELECT id FROM payrolls WHERE employee_id = ? AND year = ? AND month = ? AND status = 'LOCKED'`,
  )
    .bind(req.employee_id, year, month)
    .first();
  if (locked) {
    return jsonError('Bảng lương tháng này đã khóa — mở khóa trước khi duyệt', 409);
  }

  const now = nowInTimezone();
  const note = `Điểm danh bù: ${req.reason}`;
  await c.env.DB.prepare(
    `INSERT INTO attendance (id, employee_id, date, check_in, check_out, status, ip, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PRESENT', NULL, ?, ?, ?)
     ON CONFLICT(employee_id, date) DO UPDATE SET
       status = 'PRESENT',
       check_in = excluded.check_in,
       check_out = excluded.check_out,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  )
    .bind(randomId(), req.employee_id, req.date, req.check_in, req.check_out, note, now, now)
    .run();

  const reviewer = c.get('user');
  await c.env.DB.prepare(
    `UPDATE attendance_requests
     SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(reviewer.id, now, body.review_note ?? null, now, id)
    .run();

  await writeAuditLog(c.env.DB, {
    userId: reviewer.id,
    action: 'UPDATE_ATTENDANCE',
    targetType: 'attendance_request',
    targetId: id,
    ip: c.get('clientIp'),
    metadata: { op: 'approve', employee_id: req.employee_id, date: req.date },
  });

  const row = await c.env.DB.prepare('SELECT * FROM attendance_requests WHERE id = ?')
    .bind(id)
    .first();
  return c.json({ data: row });
});

attendanceRoutes.post('/requests/:id/reject', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  let body: z.infer<typeof reviewSchema> = {};
  try {
    if (c.req.header('content-type')?.includes('application/json')) {
      body = reviewSchema.parse(await c.req.json());
    }
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const req = await c.env.DB.prepare(
    'SELECT id, employee_id, date, status FROM attendance_requests WHERE id = ?',
  )
    .bind(id)
    .first<{ id: string; employee_id: string; date: string; status: string }>();
  if (!req) return jsonError('Not found', 404);
  if (req.status !== 'PENDING') return jsonError('Yêu cầu đã được xử lý', 409);

  const now = nowInTimezone();
  const reviewer = c.get('user');
  await c.env.DB.prepare(
    `UPDATE attendance_requests
     SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(reviewer.id, now, body.review_note ?? null, now, id)
    .run();

  await writeAuditLog(c.env.DB, {
    userId: reviewer.id,
    action: 'UPDATE_ATTENDANCE',
    targetType: 'attendance_request',
    targetId: id,
    ip: c.get('clientIp'),
    metadata: { op: 'reject', employee_id: req.employee_id, date: req.date },
  });

  const row = await c.env.DB.prepare('SELECT * FROM attendance_requests WHERE id = ?')
    .bind(id)
    .first();
  return c.json({ data: row });
});

const adminUpdateSchema = z.object({
  status: z.enum(['PRESENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'ABSENT']),
  check_in: z.string().nullable().optional(),
  check_out: z.string().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

attendanceRoutes.put('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  let body: z.infer<typeof adminUpdateSchema>;
  try {
    body = adminUpdateSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM attendance WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) return jsonError('Not found', 404);

  const now = nowInTimezone();
  await c.env.DB.prepare(
    `UPDATE attendance SET status = ?, check_in = COALESCE(?, check_in), check_out = COALESCE(?, check_out),
     note = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      body.status,
      body.check_in ?? null,
      body.check_out ?? null,
      body.note ?? null,
      now,
      id,
    )
    .run();

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'UPDATE_ATTENDANCE',
    targetType: 'attendance',
    targetId: id,
    ip: c.get('clientIp'),
    metadata: body,
  });

  const row = await c.env.DB.prepare('SELECT * FROM attendance WHERE id = ?').bind(id).first();
  return c.json({ data: row });
});

const adminCreateSchema = z.object({
  employee_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['PRESENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'ABSENT']),
  check_in: z.string().nullable().optional(),
  check_out: z.string().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

attendanceRoutes.post('/admin', requireRole('ADMIN'), async (c) => {
  let body: z.infer<typeof adminCreateSchema>;
  try {
    body = adminCreateSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const now = nowInTimezone();
  const id = randomId();
  try {
    await c.env.DB.prepare(
      `INSERT INTO attendance (id, employee_id, date, check_in, check_out, status, ip, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, date) DO UPDATE SET
         status = excluded.status,
         check_in = excluded.check_in,
         check_out = excluded.check_out,
         note = excluded.note,
         updated_at = excluded.updated_at`,
    )
      .bind(
        id,
        body.employee_id,
        body.date,
        body.check_in ?? null,
        body.check_out ?? null,
        body.status,
        c.get('clientIp'),
        body.note ?? null,
        now,
        now,
      )
      .run();
  } catch (e) {
    return jsonError('Failed to save attendance', 400, String(e));
  }

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'UPDATE_ATTENDANCE',
    targetType: 'attendance',
    targetId: id,
    ip: c.get('clientIp'),
    metadata: body,
  });

  const row = await c.env.DB.prepare(
    'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
  )
    .bind(body.employee_id, body.date)
    .first();
  return c.json({ data: row }, 201);
});
