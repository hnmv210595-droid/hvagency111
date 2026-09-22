const TZ = 'Asia/Ho_Chi_Minh';

/** Current datetime string in Asia/Ho_Chi_Minh as ISO-like local: YYYY-MM-DDTHH:mm:ss */
export function nowInTimezone(timezone = TZ): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function todayInTimezone(timezone = TZ): string {
  return nowInTimezone(timezone).slice(0, 10);
}

export function formatTimeInTimezone(timezone = TZ): string {
  return nowInTimezone(timezone).slice(11);
}

export function parseYearMonth(year?: number | string, month?: number | string): {
  year: number;
  month: number;
} {
  const now = nowInTimezone();
  const y = year != null ? Number(year) : Number(now.slice(0, 4));
  const m = month != null ? Number(month) : Number(now.slice(5, 7));
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new Error('Invalid year');
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('Invalid month');
  }
  return { year: y, month: m };
}

export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}
