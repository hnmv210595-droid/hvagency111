export const DEFAULT_SETTINGS = {
  company_name: 'HV-Agency',
  company_ips: ['115.76.54.149'],
  standard_work_days: 26,
  paid_leave_days: 4,
  default_insurance_rate: 0,
  currency: 'VNĐ',
  timezone: 'Asia/Ho_Chi_Minh',
} as const;

export const SESSION_COOKIE = 'hv_session';

export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'PAID_LEAVE',
  'UNPAID_LEAVE',
  'ABSENT',
] as const;
