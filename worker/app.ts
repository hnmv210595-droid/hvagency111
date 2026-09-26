import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, Variables } from './env';
import { authRoutes } from './routes/auth';
import { employeeRoutes } from './routes/employees';
import { attendanceRoutes } from './routes/attendance';
import { revenueRoutes } from './routes/revenues';
import { payrollRoutes } from './routes/payroll';
import { dashboardRoutes } from './routes/dashboard';
import { settingsRoutes, reportRoutes, auditRoutes } from './routes/settings';
import { telegramRoutes } from './routes/telegram';
import { authMiddleware } from './middleware/auth';
import { jsonError } from './lib/audit';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  '*',
  secureHeaders({
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
  }),
);

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'HV-Agency Internal',
    timezone: c.env.TIMEZONE ?? 'Asia/Ho_Chi_Minh',
  }),
);

app.route('/api/auth', authRoutes);

app.get('/api/me', authMiddleware, async (c) => {
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

app.route('/api/employees', employeeRoutes);
app.route('/api/attendance', attendanceRoutes);
app.route('/api/revenues', revenueRoutes);
app.route('/api/payroll', payrollRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/audit-logs', auditRoutes);
app.route('/api/telegram', telegramRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return jsonError('Not found', 404);
  }
  return jsonError('Not found', 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
