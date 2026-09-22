import type { Env } from '../env';
import { hashPassword, randomId } from './crypto';
import { nowInTimezone } from './time';

const DEFAULT_ADMIN_USERNAME = 'Admin111';

/**
 * Ensure ADMIN user exists / password matches Cloudflare secret ADMIN_PASSWORD.
 * Username defaults to Admin111 (override with secret/var ADMIN_USERNAME).
 * Never commit plaintext passwords — set via:
 *   wrangler secret put ADMIN_PASSWORD
 */
export async function ensureAdminFromSecrets(env: Env): Promise<void> {
  const password = env.ADMIN_PASSWORD?.trim();
  if (!password || password.length < 8) {
    return;
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
    return;
  }

  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO users (id, username, email, password_hash, role, status, employee_id, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 'ADMIN', 'ACTIVE', NULL, ?, ?)`,
  )
    .bind(id, username, passwordHash, now, now)
    .run();
}
