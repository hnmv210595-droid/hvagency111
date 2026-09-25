/** Parse percent input (supports "1", "1.5", "1,5", "1%") to exactly 2 decimal places. */
export function parsePercent(value: unknown): number {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const cleaned = value.trim().replace(/%/g, '').replace(/\s/g, '').replace(',', '.');
    if (cleaned === '') return 0;
    n = Number(cleaned);
  } else if (value == null) {
    return 0;
  } else {
    n = Number(value);
  }

  if (!Number.isFinite(n)) {
    throw new Error('Invalid percent');
  }

  // Integer basis-points rounding avoids float drift (e.g. 1 staying 1, not 0.99)
  return Math.round(n * 100) / 100;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return String(parsePercent(value));
}
