import type { Env } from '../env';
import type { AuditAction } from '../../shared/types';
import { randomId } from './crypto';
import { nowInTimezone } from './time';

export async function writeAuditLog(
  db: D1Database,
  params: {
    userId?: string | null;
    action: AuditAction;
    targetType?: string | null;
    targetId?: string | null;
    ip?: string | null;
    metadata?: unknown;
    timezone?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip, timestamp, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      randomId(),
      params.userId ?? null,
      params.action,
      params.targetType ?? null,
      params.targetId ?? null,
      params.ip ?? null,
      nowInTimezone(params.timezone),
      params.metadata != null ? JSON.stringify(params.metadata) : null,
    )
    .run();
}

export function jsonError(message: string, status = 400, details?: unknown): Response {
  return Response.json({ error: message, details }, { status });
}

export function getSessionSecret(env: Env): string {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {
    throw new Error('SESSION_SECRET is not configured');
  }
  return env.SESSION_SECRET;
}
