import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { jsonError } from '../lib/audit';
import { telegramSendMessage, telegramSetWebhook, escapeHtml } from '../lib/telegram';
import { sendMonthlyPayrollToTelegram } from '../services/payrollTelegram';
import { authMiddleware, requireRole } from '../middleware/auth';

export const telegramRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Receive-bot webhook: reply with chat_id when someone messages the bot
 * (in private chat or after adding bot to a group).
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

  const chat =
    update.message?.chat ??
    update.my_chat_member?.chat ??
    null;

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
    `Copy Chat ID này vào Cloudflare Secret <b>TELEGRAM_CHAT_ID</b> để bot gửi lương.`,
  ]
    .filter(Boolean)
    .join('\n');

  await telegramSendMessage(token, chatId, reply);
  return c.json({ ok: true, chat_id: chatId });
});

telegramRoutes.use('/admin/*', authMiddleware, requireRole('ADMIN'));

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
