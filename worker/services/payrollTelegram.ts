import type { Env } from '../env';
import { parseYearMonth } from '../lib/time';
import { formatPayrollTelegramMessage, telegramSendMessage } from '../lib/telegram';

function previousYearMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export interface SendPayrollResult {
  year: number;
  month: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * Send each employee's payroll for a period to the fixed Telegram group.
 * Default period = previous calendar month (runs on day 1).
 */
export async function sendMonthlyPayrollToTelegram(
  env: Env,
  opts?: { year?: number; month?: number },
): Promise<SendPayrollResult> {
  const token = env.TELEGRAM_SEND_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    return {
      year: 0,
      month: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: ['TELEGRAM_SEND_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured'],
    };
  }

  const now = parseYearMonth();
  const target =
    opts?.year != null && opts?.month != null
      ? parseYearMonth(opts.year, opts.month)
      : previousYearMonth(now.year, now.month);

  const { results } = await env.DB.prepare(
    `SELECT p.base_salary, p.commission, p.unpaid_leave_days, p.net_salary, p.status,
            e.name AS employee_name
     FROM payrolls p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.year = ? AND p.month = ?
       AND e.status = 'ACTIVE'
     ORDER BY e.name ASC`,
  )
    .bind(target.year, target.month)
    .all<{
      base_salary: number;
      commission: number;
      unpaid_leave_days: number;
      net_salary: number;
      status: string;
      employee_name: string;
    }>();

  const rows = results ?? [];
  // Prefer LOCKED; if none locked, send CALCULATED rows
  const locked = rows.filter((r) => r.status === 'LOCKED');
  const toSend = locked.length > 0 ? locked : rows.filter((r) => r.status === 'CALCULATED');

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of toSend) {
    const text = formatPayrollTelegramMessage({
      employeeName: row.employee_name,
      year: target.year,
      month: target.month,
      baseSalary: row.base_salary,
      commission: row.commission,
      unpaidLeaveDays: row.unpaid_leave_days ?? 0,
      netSalary: row.net_salary,
    });

    const result = await telegramSendMessage(token, chatId, text);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      errors.push(`${row.employee_name}: ${result.description ?? 'send failed'}`);
    }

    // Soft rate-limit Telegram API
    await new Promise((r) => setTimeout(r, 50));
  }

  return {
    year: target.year,
    month: target.month,
    sent,
    failed,
    skipped: rows.length - toSend.length,
    errors,
  };
}
