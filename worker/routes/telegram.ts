import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { writeAuditLog, jsonError } from '../lib/audit';
import { randomId } from '../lib/crypto';
import { nowInTimezone } from '../lib/time';
import { telegramSendMessage, telegramSetWebhook, escapeHtml } from '../lib/telegram';
import { sendMonthlyPayrollToTelegram } from '../services/payrollTelegram';
import { authMiddleware, requireRole } from '../middleware/auth';

export const telegramRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const chatIdSchema = z
  .string()
  .trim()
  .regex(/^-?\d{5,20}$/, 'Chat ID phải là số (vd. -5581029985 hoặc -100xxxxxxxxxx)');

const groupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  chat_id: chatIdSchema,
  enabled: z.boolean().optional(),
});

type GroupRow = {
  id: string;
  name: string;
  chat_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

function mapGroup(row: GroupRow) {
  return {
    id: row.id,
    name: row.name,
    chat_id: row.chat_id,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Receive-bot webhook: reply with chat_id when someone messages the bot.
 * No session auth — secured by optional Telegram secret_token header.
 */
telegramRoutes.post('/webhook', async (c) => {
  const expected = c.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (expected) {
    const got = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    if (got !== expected) return jsonError('Unauthorized', 401);
  }

  const token = c.env.TELEGRAM_RECEIVE_BOT_TOKEN?.trim();
  if (!token) return c.json({ ok: true, skipped: 'RECEIVE_BOT_NOT_CONFIGURED' });

  let update: {
    message?: {
      chat?: { id: number; title?: string; type?: string };
      text?: string;
    };
    my_chat_member?: {
      chat?: { id: number; title?: string; type?: string };
    };
  };
  try {
    update = await c.req.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const chat = update.message?.chat ?? update.my_chat_member?.chat ?? null;
  if (!chat?.id) {
    return c.json({ ok: true });
  }

  const chatId = String(chat.id);
  const title = chat.title ? escapeHtml(chat.title) : chat.type ?? 'chat';
  const reply = [
    `Chat ID của hội thoại này:`,
    `<b>${escapeHtml(chatId)}</b>`,
    ``,
    `Loại: ${escapeHtml(String(chat.type ?? 'unknown'))}`,
    title ? `Tên: ${title}` : '',
    ``,
    `Vào website HV-Agency → <b>Telegram</b> → thêm nhóm với Chat ID này.`,
  ]
    .filter(Boolean)
    .join('\n');

  await telegramSendMessage(token, chatId, reply);
  return c.json({ ok: true, chat_id: chatId });
});

telegramRoutes.use('/admin/*', authMiddleware, requireRole('ADMIN'));

telegramRoutes.get('/admin/groups', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, chat_id, enabled, created_at, updated_at
     FROM telegram_groups
     ORDER BY name ASC`,
  ).all<GroupRow>();
  return c.json({ data: (results ?? []).map(mapGroup) });
});

telegramRoutes.post('/admin/groups', async (c) => {
  let body: z.infer<typeof groupSchema>;
  try {
    body = groupSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const id = randomId();
  const now = nowInTimezone();
  const enabled = body.enabled === false ? 0 : 1;

  try {
    await c.env.DB.prepare(
      `INSERT INTO telegram_groups (id, name, chat_id, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, body.name, body.chat_id, enabled, now, now)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return jsonError('Chat ID đã tồn tại', 409);
    }
    throw e;
  }

  const user = c.get('user');
  await writeAuditLog(c.env.DB, {
    userId: user.id,
    action: 'UPDATE_SETTINGS',
    targetType: 'telegram_group',
    targetId: id,
    ip: c.get('clientIp'),
    metadata: { op: 'create', chat_id: body.chat_id, name: body.name },
  });

  const row = await c.env.DB.prepare(
    `SELECT id, name, chat_id, enabled, created_at, updated_at FROM telegram_groups WHERE id = ?`,
  )
    .bind(id)
    .first<GroupRow>();
  return c.json({ data: mapGroup(row!) }, 201);
});

telegramRoutes.put('/admin/groups/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    `SELECT id FROM telegram_groups WHERE id = ?`,
  )
    .bind(id)
    .first();
  if (!existing) return jsonError('Not found', 404);

  let body: z.infer<typeof groupSchema>;
  try {
    body = groupSchema.parse(await c.req.json());
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const now = nowInTimezone();
  const enabled = body.enabled === false ? 0 : 1;

  try {
    await c.env.DB.prepare(
      `UPDATE telegram_groups
       SET name = ?, chat_id = ?, enabled = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(body.name, body.chat_id, enabled, now, id)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return jsonError('Chat ID đã tồn tại', 409);
    }
    throw e;
  }

  const user = c.get('user');
  await writeAuditLog(c.env.DB, {
    userId: user.id,
    action: 'UPDATE_SETTINGS',
    targetType: 'telegram_group',
    targetId: id,
    ip: c.get('clientIp'),
    metadata: { op: 'update', chat_id: body.chat_id, name: body.name, enabled },
  });

  const row = await c.env.DB.prepare(
    `SELECT id, name, chat_id, enabled, created_at, updated_at FROM telegram_groups WHERE id = ?`,
  )
    .bind(id)
    .first<GroupRow>();
  return c.json({ data: mapGroup(row!) });
});

telegramRoutes.delete('/admin/groups/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    `SELECT id, chat_id, name FROM telegram_groups WHERE id = ?`,
  )
    .bind(id)
    .first<{ id: string; chat_id: string; name: string }>();
  if (!existing) return jsonError('Not found', 404);

  await c.env.DB.prepare(`DELETE FROM telegram_groups WHERE id = ?`).bind(id).run();

  const user = c.get('user');
  await writeAuditLog(c.env.DB, {
    userId: user.id,
    action: 'UPDATE_SETTINGS',
    targetType: 'telegram_group',
    targetId: id,
    ip: c.get('clientIp'),
    metadata: { op: 'delete', chat_id: existing.chat_id, name: existing.name },
  });

  return c.json({ ok: true });
});

/** Manually send payroll messages for a period (default: previous month). */
telegramRoutes.post('/admin/send-payroll', async (c) => {
  const schema = z.object({
    year: z.number().int().optional(),
    month: z.number().int().optional(),
  });
  let body: z.infer<typeof schema> = {};
  try {
    if (c.req.header('content-type')?.includes('application/json')) {
      body = schema.parse(await c.req.json());
    }
  } catch (e) {
    return jsonError('Invalid input', 400, e);
  }

  const result = await sendMonthlyPayrollToTelegram(c.env, body);
  return c.json({ data: result });
});

/** Point the receive bot webhook at this Worker. */
telegramRoutes.post('/admin/setup-receive-webhook', async (c) => {
  const token = c.env.TELEGRAM_RECEIVE_BOT_TOKEN?.trim();
  if (!token) return jsonError('TELEGRAM_RECEIVE_BOT_TOKEN is not configured', 400);

  const origin = new URL(c.req.url).origin;
  const webhookUrl = `${origin}/api/telegram/webhook`;
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const result = await telegramSetWebhook(token, webhookUrl, secret);
  if (!result.ok) {
    return jsonError(result.description ?? 'setWebhook failed', 400);
  }
  return c.json({ ok: true, webhook_url: webhookUrl });
});
