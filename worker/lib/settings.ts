import type { SystemSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import { parseCompanyIps } from './ip';
import { nowInTimezone } from './time';

export async function getSettings(db: D1Database, envCompanyIp?: string): Promise<SystemSettings> {
  const { results } = await db
    .prepare('SELECT key, value FROM system_settings')
    .all<{ key: string; value: string }>();

  const map = new Map(results?.map((r) => [r.key, r.value]) ?? []);

  const companyIpsRaw = map.get('company_ips') ?? JSON.stringify(DEFAULT_SETTINGS.company_ips);
  let company_ips: string[] = [];
  try {
    company_ips = parseCompanyIps(envCompanyIp, companyIpsRaw);
  } catch {
    company_ips = parseCompanyIps(envCompanyIp, [...DEFAULT_SETTINGS.company_ips]);
  }
  if (company_ips.length === 0) {
    company_ips = [...DEFAULT_SETTINGS.company_ips];
  }

  return {
    company_name: map.get('company_name') ?? DEFAULT_SETTINGS.company_name,
    company_ips,
    standard_work_days: Number(map.get('standard_work_days') ?? DEFAULT_SETTINGS.standard_work_days),
    paid_leave_days: Number(map.get('paid_leave_days') ?? DEFAULT_SETTINGS.paid_leave_days),
    default_insurance_rate: Number(
      map.get('default_insurance_rate') ?? DEFAULT_SETTINGS.default_insurance_rate,
    ),
    currency: map.get('currency') ?? DEFAULT_SETTINGS.currency,
    timezone: map.get('timezone') ?? DEFAULT_SETTINGS.timezone,
  };
}

export async function setSetting(
  db: D1Database,
  key: string,
  value: string,
  updatedBy?: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO system_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(key, value, nowInTimezone(), updatedBy ?? null)
    .run();
}
