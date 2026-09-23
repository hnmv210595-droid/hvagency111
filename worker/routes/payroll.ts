import { Hono } from 'hono';
import { z } from 'zod';
import { PayrollCalculationService } from '../../shared/PayrollCalculationService';
import type { Env, Variables } from '../env';
import { writeAuditLog, jsonError } from '../lib/audit';
import { randomId } from '../lib/crypto';
import { getSettings } from '../lib/settings';
import { monthDateRange, nowInTimezone, parseYearMonth } from '../lib/time';
import { authMiddleware, requireRole } from '../middleware/auth';

export const payrollRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

payrollRoutes.use('*', authMiddleware);

function previousYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function isCurrentOrPreviousMonth(year: number, month: number): boolean {
  const now = parseYearMonth();
  const prev = previousYearMonth(now.year, now.month);
  return (
    (year === now.year && month === now.month) ||
    (year === prev.year && month === prev.month)
  );
}

payrollRoutes.get('/', async (c) => {
  const user = c.get('user');
  const employeeId = c.req.query('employee_id');
  const year = c.req.query('year');
  const month = c.req.query('month');
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50)));
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (user.role === 'EMPLOYEE') {
    if (!user.employee_id) return jsonError('No employee profile', 404);
    clauses.push('p.employee_id = ?');
    binds.push(user.employee_id);

    if (year && month) {
      try {
        const ym = parseYearMonth(year, month);
        if (!isCurrentOrPreviousMonth(ym.year, ym.month)) {
          return jsonError('Employees may only view current and previous month payroll', 403);
        }
      } catch {
        return jsonError('Invalid year/month', 400);
      }
    } else {
      // Restrict to current + previous month only
      const now = parseYearMonth();
      const prev = previousYearMonth(now.year, now.month);
      clauses.push(
        '((p.year = ? AND p.month = ?) OR (p.year = ? AND p.month = ?))',
      );
      binds.push(now.year, now.month, prev.year, prev.month);
    }
  } else if (employeeId) {
    clauses.push('p.employee_id = ?');
    binds.push(employeeId);
  }

  if (user.role !== 'EMPLOYEE') {
    if (year) {
      clauses.push('p.year = ?');
      binds.push(Number(year));
    }
    if (month) {
      clauses.push('p.month = ?');
      binds.push(Number(month));
    }
  } else if (year && month) {
    clauses.push('p.year = ?');
    binds.push(Number(year));
    clauses.push('p.month = ?');
    binds.push(Number(month));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM payrolls p ${where}`)
    .bind(...binds)
    .first<{ cnt: number }>();

  const { results } = await c.env.DB.prepare(
    `SELECT p.*, e.name AS employee_name, e.employee_code
     FROM payrolls p
     JOIN employees e ON e.id = p.employee_id
     ${where}
     ORDER BY p.year DESC, p.month DESC, e.name ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all();

  return c.json({ data: results ?? [], total: totalRow?.cnt ?? 0, page, limit });
});

const calcSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  employee_ids: z.array(z.string()).optional(),
  other_deductions: z.record(z.string(), z.number()).optional(),
  preview: z.boolean().optional(),
});

async function buildPayrollForEmployee(
  db: D1Database,
  employee: {
    id: string;
    base_salary: number;
    commission_rate: number;
    insurance_rate: number;
    insurance_base: number;
    name: string;
    employee_code: string;
  },
  year: number,
  month: number,
  standardWorkDays: number,
  otherDeductions: number,
) {
  const range = monthDateRange(year, month);
  const counts = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present_days,
         SUM(CASE WHEN status = 'PAID_LEAVE' THEN 1 ELSE 0 END) AS paid_leave_days,
         SUM(CASE WHEN status = 'UNPAID_LEAVE' THEN 1 ELSE 0 END) AS unpaid_leave_days,
         SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days
       FROM attendance
       WHERE employee_id = ? AND date >= ? AND date <= ?`,
    )
    .bind(employee.id, range.start, range.end)
    .first<{
      present_days: number | null;
      paid_leave_days: number | null;
      unpaid_leave_days: number | null;
      absent_days: number | null;
    }>();

  const revenueRow = await db
    .prepare('SELECT amount FROM revenues WHERE employee_id = ? AND year = ? AND month = ?')
    .bind(employee.id, year, month)
    .first<{ amount: number }>();

  const result = PayrollCalculationService.calculate({
    baseSalary: employee.base_salary,
    standardWorkDays,
    presentDays: counts?.present_days ?? 0,
    paidLeaveDays: counts?.paid_leave_days ?? 0,
    unpaidLeaveDays: counts?.unpaid_leave_days ?? 0,
    absentDays: counts?.absent_days ?? 0,
    revenue: revenueRow?.amount ?? 0,
    commissionRate: employee.commission_rate,
    insuranceBase: employee.insurance_base,
    insuranceRate: employee.insurance_rate,
    otherDeductions,
  });

  return {
    employee_id: employee.id,
    employee_name: employee.name,
    employee_code: employee.employee_code,
    year,
    month,
    base_salary: employee.base_salary,
    standard_work_days: standardWorkDays,
    ...result,
  };
}

/** Employee: current month (live to-date) + previous month only. */
payrollRoutes.get('/my-summary', requireRole('EMPLOYEE'), async (c) => {
  const user = c.get('user');
  if (!user.employee_id) return jsonError('No employee profile', 404);

  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const current = parseYearMonth();
  const previous = previousYearMonth(current.year, current.month);

  const emp = await c.env.DB.prepare(
    `SELECT id, name, employee_code, base_salary, commission_rate, insurance_rate, insurance_base
     FROM employees WHERE id = ?`,
  )
    .bind(user.employee_id)
    .first<{
      id: string;
      name: string;
      employee_code: string;
      base_salary: number;
      commission_rate: number;
      insurance_rate: number;
      insurance_base: number;
    }>();

  if (!emp) return jsonError('Employee not found', 404);

  const currentLive = await buildPayrollForEmployee(
    c.env.DB,
    emp,
    current.year,
    current.month,
    settings.standard_work_days,
    0,
  );

  const prevStored = await c.env.DB.prepare(
    `SELECT p.*, e.name AS employee_name, e.employee_code
     FROM payrolls p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.employee_id = ? AND p.year = ? AND p.month = ?`,
  )
    .bind(user.employee_id, previous.year, previous.month)
    .first();

  let previousData: Record<string, unknown> | Awaited<ReturnType<typeof buildPayrollForEmployee>> =
    prevStored ??
    (await buildPayrollForEmployee(
      c.env.DB,
      emp,
      previous.year,
      previous.month,
      settings.standard_work_days,
      0,
    ));

  return c.json({
    currency: settings.currency,
    current: {
      label: `${current.year}-${String(current.month).padStart(2, '0')}`,
      year: current.year,
      month: current.month,
      source: 'live_to_date',
      data: currentLive,
    },
    previous: {
      label: `${previous.year}-${String(previous.month).padStart(2, '0')}`,
      year: previous.year,
      month: previous.month,
      source: prevStored ? 'payroll' : 'live',
      data: previousData,
    },
  });
});

payrollRoutes.post('/calculate', requireRole('ADMIN'), async (c) => {
  let body: z.infer<typeof calcSchema>;
  try {
    body = calcSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const { year, month } = parseYearMonth(body.year, body.month);
  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const preview = body.preview === true;

  let employeesQuery = `SELECT id, name, employee_code, base_salary, commission_rate, insurance_rate, insurance_base
     FROM employees WHERE status = 'ACTIVE'`;
  const binds: unknown[] = [];
  if (body.employee_ids?.length) {
    employeesQuery += ` AND id IN (${body.employee_ids.map(() => '?').join(',')})`;
    binds.push(...body.employee_ids);
  }

  const { results: employees } = await c.env.DB.prepare(employeesQuery)
    .bind(...binds)
    .all<{
      id: string;
      name: string;
      employee_code: string;
      base_salary: number;
      commission_rate: number;
      insurance_rate: number;
      insurance_base: number;
    }>();

  const calculated = [];
  for (const emp of employees ?? []) {
    const locked = await c.env.DB.prepare(
      `SELECT id, status FROM payrolls WHERE employee_id = ? AND year = ? AND month = ?`,
    )
      .bind(emp.id, year, month)
      .first<{ id: string; status: string }>();

    if (locked?.status === 'LOCKED' && !preview) {
      continue;
    }

    const other = body.other_deductions?.[emp.id] ?? 0;
    const row = await buildPayrollForEmployee(
      c.env.DB,
      emp,
      year,
      month,
      settings.standard_work_days,
      other,
    );
    calculated.push(row);

    if (!preview) {
      const now = nowInTimezone(settings.timezone);
      const id = locked?.id ?? randomId();
      await c.env.DB.prepare(
        `INSERT INTO payrolls (
           id, employee_id, year, month, base_salary, standard_work_days,
           present_days, paid_leave_days, unpaid_leave_days, absent_days, paid_days,
           base_salary_paid, revenue, commission_rate, commission, gross_income,
           insurance_base, insurance_rate, social_insurance, other_deductions, net_salary,
           status, calculated_at, locked_at, locked_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CALCULATED', ?, NULL, NULL, ?, ?)
         ON CONFLICT(employee_id, year, month) DO UPDATE SET
           base_salary = excluded.base_salary,
           standard_work_days = excluded.standard_work_days,
           present_days = excluded.present_days,
           paid_leave_days = excluded.paid_leave_days,
           unpaid_leave_days = excluded.unpaid_leave_days,
           absent_days = excluded.absent_days,
           paid_days = excluded.paid_days,
           base_salary_paid = excluded.base_salary_paid,
           revenue = excluded.revenue,
           commission_rate = excluded.commission_rate,
           commission = excluded.commission,
           gross_income = excluded.gross_income,
           insurance_base = excluded.insurance_base,
           insurance_rate = excluded.insurance_rate,
           social_insurance = excluded.social_insurance,
           other_deductions = excluded.other_deductions,
           net_salary = excluded.net_salary,
           status = CASE WHEN payrolls.status = 'LOCKED' THEN payrolls.status ELSE 'CALCULATED' END,
           calculated_at = excluded.calculated_at,
           updated_at = excluded.updated_at
         WHERE payrolls.status != 'LOCKED'`,
      )
        .bind(
          id,
          emp.id,
          year,
          month,
          row.base_salary,
          row.standard_work_days,
          row.presentDays,
          row.paidLeaveDays,
          row.unpaidLeaveDays,
          row.absentDays,
          row.paidDays,
          row.baseSalaryPaid,
          row.revenue,
          row.commissionRate,
          row.commission,
          row.grossIncome,
          row.insuranceBase,
          row.insuranceRate,
          row.socialInsurance,
          row.otherDeductions,
          row.netSalary,
          now,
          now,
          now,
        )
        .run();
    }
  }

  if (!preview) {
    await writeAuditLog(c.env.DB, {
      userId: c.get('user').id,
      action: 'CALCULATE_PAYROLL',
      targetType: 'payroll',
      targetId: `${year}-${month}`,
      ip: c.get('clientIp'),
      metadata: { year, month, count: calculated.length },
    });
  }

  return c.json({ data: calculated, preview, year, month });
});

payrollRoutes.post('/:id/lock', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM payrolls WHERE id = ?')
    .bind(id)
    .first<{ id: string; status: string }>();
  if (!row) return jsonError('Not found', 404);
  if (row.status === 'LOCKED') return jsonError('Already locked', 409);

  const now = nowInTimezone();
  await c.env.DB.prepare(
    `UPDATE payrolls SET status = 'LOCKED', locked_at = ?, locked_by = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(now, c.get('user').id, now, id)
    .run();

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'LOCK_PAYROLL',
    targetType: 'payroll',
    targetId: id,
    ip: c.get('clientIp'),
  });

  const updated = await c.env.DB.prepare('SELECT * FROM payrolls WHERE id = ?').bind(id).first();
  return c.json({ data: updated });
});

payrollRoutes.post('/:id/unlock', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM payrolls WHERE id = ?')
    .bind(id)
    .first<{ id: string; status: string }>();
  if (!row) return jsonError('Not found', 404);
  if (row.status !== 'LOCKED') return jsonError('Not locked', 400);

  const now = nowInTimezone();
  await c.env.DB.prepare(
    `UPDATE payrolls SET status = 'CALCULATED', locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(now, id)
    .run();

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'UNLOCK_PAYROLL',
    targetType: 'payroll',
    targetId: id,
    ip: c.get('clientIp'),
  });

  const updated = await c.env.DB.prepare('SELECT * FROM payrolls WHERE id = ?').bind(id).first();
  return c.json({ data: updated });
});

payrollRoutes.post('/lock-period', requireRole('ADMIN'), async (c) => {
  const schema = z.object({
    year: z.number().int(),
    month: z.number().int(),
  });
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await c.req.json());
  } catch {
    return jsonError('Invalid input', 400);
  }
  const { year, month } = parseYearMonth(body.year, body.month);
  const now = nowInTimezone();
  await c.env.DB.prepare(
    `UPDATE payrolls SET status = 'LOCKED', locked_at = ?, locked_by = ?, updated_at = ?
     WHERE year = ? AND month = ? AND status != 'LOCKED'`,
  )
    .bind(now, c.get('user').id, now, year, month)
    .run();

  await writeAuditLog(c.env.DB, {
    userId: c.get('user').id,
    action: 'LOCK_PAYROLL',
    targetType: 'payroll_period',
    targetId: `${year}-${month}`,
    ip: c.get('clientIp'),
  });

  return c.json({ ok: true });
});
