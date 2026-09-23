import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { jsonError } from '../lib/audit';
import { getSettings } from '../lib/settings';
import { monthDateRange, parseYearMonth } from '../lib/time';
import { authMiddleware, requireRole } from '../middleware/auth';

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

dashboardRoutes.use('*', authMiddleware);

dashboardRoutes.get('/admin', requireRole('ADMIN'), async (c) => {
  const yearQ = c.req.query('year');
  const monthQ = c.req.query('month');
  let year: number;
  let month: number;
  try {
    ({ year, month } = parseYearMonth(yearQ, monthQ));
  } catch {
    return jsonError('Invalid period', 400);
  }

  const settings = await getSettings(c.env.DB, c.env.COMPANY_IP);
  const range = monthDateRange(year, month);

  const empStats = await c.env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active
     FROM employees`,
  ).first<{ total: number; active: number }>();

  const payrollStats = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(net_salary), 0) AS total_payroll,
       COALESCE(SUM(commission), 0) AS total_commission,
       COALESCE(SUM(social_insurance), 0) AS total_insurance,
       COALESCE(SUM(revenue), 0) AS total_revenue,
       COALESCE(SUM(paid_days), 0) AS total_paid_days
     FROM payrolls WHERE year = ? AND month = ?`,
  )
    .bind(year, month)
    .first();

  const revenueFallback = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues WHERE year = ? AND month = ?`,
  )
    .bind(year, month)
    .first<{ total: number }>();

  const attendanceStats = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END), 0) AS present_days
     FROM attendance WHERE date >= ? AND date <= ?`,
  )
    .bind(range.start, range.end)
    .first<{ present_days: number }>();

  // Last 6 months chart data
  const chart = [];
  for (let i = 5; i >= 0; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const p = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(net_salary), 0) AS payroll, COALESCE(SUM(revenue), 0) AS revenue
       FROM payrolls WHERE year = ? AND month = ?`,
    )
      .bind(y, m)
      .first<{ payroll: number; revenue: number }>();
    const r = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS revenue FROM revenues WHERE year = ? AND month = ?`,
    )
      .bind(y, m)
      .first<{ revenue: number }>();
    chart.push({
      label: `${y}-${String(m).padStart(2, '0')}`,
      payroll: p?.payroll ?? 0,
      revenue: (p?.revenue ?? 0) > 0 ? p!.revenue : (r?.revenue ?? 0),
    });
  }

  return c.json({
    period: { year, month },
    settings: {
      standard_work_days: settings.standard_work_days,
      currency: settings.currency,
    },
    stats: {
      total_employees: empStats?.total ?? 0,
      active_employees: empStats?.active ?? 0,
      total_payroll: (payrollStats as { total_payroll: number })?.total_payroll ?? 0,
      total_commission: (payrollStats as { total_commission: number })?.total_commission ?? 0,
      total_insurance: (payrollStats as { total_insurance: number })?.total_insurance ?? 0,
      total_revenue:
        ((payrollStats as { total_revenue: number })?.total_revenue ?? 0) ||
        (revenueFallback?.total ?? 0),
      total_work_days:
        (payrollStats as { total_paid_days: number })?.total_paid_days ??
        attendanceStats?.present_days ??
        0,
    },
    chart,
  });
});

dashboardRoutes.get('/employee', requireRole('EMPLOYEE'), async (c) => {
  return jsonError('Forbidden', 403);
});
