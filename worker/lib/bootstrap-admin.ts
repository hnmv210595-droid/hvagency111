import type { Env } from '../env';
import { hashPassword, randomId } from './crypto';
import { nowInTimezone } from './time';

const DEFAULT_ADMIN_USERNAME = 'Admin111';

export type AdminBootstrapResult = {
  created: boolean;
  updated: boolean;
  skipped: boolean;
  reason?: string;
};

/**
 * Ensure ADMIN user exists / password matches Cloudflare secret ADMIN_PASSWORD.
 * Username defaults to Admin111 (override with secret/var ADMIN_USERNAME).
 */
export async function ensureAdminFromSecrets(env: Env): Promise<AdminBootstrapResult> {
  if (!env.DB) {
    return { created: false, updated: false, skipped: true, reason: 'DB_BINDING_MISSING' };
  }

  const password = env.ADMIN_PASSWORD?.trim();
  if (!password) {
    return { created: false, updated: false, skipped: true, reason: 'ADMIN_PASSWORD_MISSING' };
  }
  if (password.length < 8) {
    return { created: false, updated: false, skipped: true, reason: 'ADMIN_PASSWORD_TOO_SHORT' };
  }

  const username = (env.ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME).slice(0, 100);
  const now = nowInTimezone(env.TIMEZONE);
  const passwordHash = await hashPassword(password);

  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE username = ? COLLATE NOCASE AND role = 'ADMIN'`,
  )
    .bind(username)
    .first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(
      `UPDATE users SET password_hash = ?, status = 'ACTIVE', updated_at = ? WHERE id = ?`,
    )
      .bind(passwordHash, now, existing.id)
      .run();
    return { created: false, updated: true, skipped: false };
  }

  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO users (id, username, email, password_hash, role, status, employee_id, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 'ADMIN', 'ACTIVE', NULL, ?, ?)`,
  )
    .bind(id, username, passwordHash, now, now)
    .run();

  return { created: true, updated: false, skipped: false };
}
