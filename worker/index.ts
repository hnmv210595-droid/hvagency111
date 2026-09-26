import app from './app';
import type { Env } from './env';
import { ensureAdminFromSecrets, type AdminBootstrapResult } from './lib/bootstrap-admin';
import { sendMonthlyPayrollToTelegram } from './services/payrollTelegram';

let adminBootstrap: Promise<AdminBootstrapResult> | null = null;

function bootstrapAdminOnce(env: Env): Promise<AdminBootstrapResult> {
  if (!adminBootstrap) {
    adminBootstrap = ensureAdminFromSecrets(env).catch((err) => {
      console.error('Admin bootstrap failed', err);
      adminBootstrap = null;
      return {
        created: false,
        updated: false,
        skipped: true,
        reason: 'BOOTSTRAP_ERROR',
      } satisfies AdminBootstrapResult;
    });
  }
  return adminBootstrap;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const bootstrap = await bootstrapAdminOnce(env);
      // Attach bootstrap status for /api/health only (no secrets leaked)
      if (url.pathname === '/api/health') {
        let adminCount = 0;
        try {
          const row = await env.DB.prepare(
            `SELECT COUNT(*) AS cnt FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`,
          ).first<{ cnt: number }>();
          adminCount = row?.cnt ?? 0;
        } catch (err) {
          console.error('Health admin count failed', err);
        }
        return Response.json({
          ok: true,
          service: 'HV-Agency Internal',
          timezone: env.TIMEZONE ?? 'Asia/Ho_Chi_Minh',
          admin_ready: adminCount > 0,
          admin_count: adminCount,
          has_admin_password_secret: Boolean(env.ADMIN_PASSWORD?.trim()),
          has_session_secret: Boolean(env.SESSION_SECRET?.trim()),
          has_db: Boolean(env.DB),
          has_telegram_send: Boolean(env.TELEGRAM_SEND_BOT_TOKEN?.trim()),
          has_telegram_receive: Boolean(env.TELEGRAM_RECEIVE_BOT_TOKEN?.trim()),
          has_telegram_chat_id: Boolean(env.TELEGRAM_CHAT_ID?.trim()),
          bootstrap,
        });
      }
      return app.fetch(request, env, ctx);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },

  /** Day 1 ~08:00 ICT: send previous month payroll to fixed Telegram group. */
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const result = await sendMonthlyPayrollToTelegram(env);
    console.log('Telegram monthly payroll', JSON.stringify(result));
  },
};
