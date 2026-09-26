/** Escape text for Telegram HTML parse_mode. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatVndPlain(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} VNĐ`;
}

export function boldValue(value: string): string {
  return `<b>${escapeHtml(value)}</b>`;
}

export interface PayrollTelegramFields {
  employeeName: string;
  year: number;
  month: number;
  baseSalary: number;
  commission: number;
  unpaidLeaveDays: number;
  netSalary: number;
}

/** One line per field; values after the label are bold. */
export function formatPayrollTelegramMessage(fields: PayrollTelegramFields): string {
  const monthLabel = `${String(fields.month).padStart(2, '0')}/${fields.year}`;
  return [
    `Tên NV: ${boldValue(fields.employeeName)}`,
    `Tháng: ${boldValue(monthLabel)}`,
    `Lương CB: ${boldValue(formatVndPlain(fields.baseSalary))}`,
    `HH: ${boldValue(formatVndPlain(fields.commission))}`,
    `Nghỉ không lương: ${boldValue(String(fields.unpaidLeaveDays))}`,
    `Thực Nhận: ${boldValue(formatVndPlain(fields.netSalary))}`,
  ].join('\n');
}

export async function telegramSendMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  return data;
}

export async function telegramSetWebhook(
  botToken: string,
  url: string,
  secretToken?: string,
): Promise<{ ok: boolean; description?: string }> {
  const body: Record<string, unknown> = {
    url,
    allowed_updates: ['message', 'my_chat_member'],
  };
  if (secretToken) body.secret_token = secretToken;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; description?: string };
}
