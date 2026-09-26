export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  COMPANY_IP?: string;
  SESSION_SECRET: string;
  SESSION_TTL_HOURS?: string;
  LOGIN_RATE_LIMIT?: string;
  LOGIN_RATE_WINDOW_MINUTES?: string;
  TIMEZONE?: string;
  CURRENCY?: string;
  /** Cloudflare secret — plaintext admin password (hashed into D1 on bootstrap). */
  ADMIN_PASSWORD?: string;
  /** Optional; defaults to Admin111 */
  ADMIN_USERNAME?: string;
  /** Bot that sends monthly payroll messages to the fixed group. */
  TELEGRAM_SEND_BOT_TOKEN?: string;
  /** Bot that replies with chat_id (webhook) so you can discover TELEGRAM_CHAT_ID. */
  TELEGRAM_RECEIVE_BOT_TOKEN?: string;
  /** Fixed Telegram group/chat id — optional fallback if DB has no enabled groups. Prefer admin Telegram panel. */
  TELEGRAM_CHAT_ID?: string;
  /** Optional secret_token for receive-bot webhook (X-Telegram-Bot-Api-Secret-Token). */
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export type Variables = {
  user: {
    id: string;
    username: string;
    email: string | null;
    role: 'ADMIN' | 'EMPLOYEE';
    status: 'ACTIVE' | 'DISABLED';
    employee_id: string | null;
  };
  clientIp: string;
  sessionId: string;
};
