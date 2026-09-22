import app from './app';
import type { Env } from './env';
import { ensureAdminFromSecrets } from './lib/bootstrap-admin';

let adminBootstrap: Promise<void> | null = null;

function bootstrapAdminOnce(env: Env): Promise<void> {
  if (!adminBootstrap) {
    adminBootstrap = ensureAdminFromSecrets(env).catch((err) => {
      console.error('Admin bootstrap failed', err);
      adminBootstrap = null;
    });
  }
  return adminBootstrap;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      await bootstrapAdminOnce(env);
      return app.fetch(request, env, ctx);
    }

    // Serve SPA assets via Cloudflare Assets binding
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
