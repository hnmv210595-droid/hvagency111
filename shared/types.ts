export type Role = 'ADMIN' | 'EMPLOYEE';
export type UserStatus = 'ACTIVE' | 'DISABLED';
export type EmployeeStatus = 'ACTIVE' | 'DISABLED';
export type AttendanceStatus = 'PRESENT' | 'PAID_LEAVE' | 'UNPAID_LEAVE' | 'ABSENT';
export type PayrollStatus = 'DRAFT' | 'CALCULATED' | 'LOCKED';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DISABLE_USER'
  | 'RESET_PASSWORD'
  | 'UPDATE_SALARY'
  | 'UPDATE_REVENUE'
  | 'UPDATE_ATTENDANCE'
  | 'CALCULATE_PAYROLL'
  | 'LOCK_PAYROLL'
  | 'UNLOCK_PAYROLL'
  | 'UPDATE_SETTINGS';

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  employee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  employee_code: string;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  start_date: string | null;
  base_salary: number;
  commission_rate: number;
  insurance_rate: number;
  insurance_base: number;
  status: EmployeeStatus;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  ip: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Revenue {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payroll {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  base_salary: number;
  standard_work_days: number;
  present_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  paid_days: number;
  base_salary_paid: number;
  revenue: number;
  commission_rate: number;
  commission: number;
  gross_income: number;
  insurance_base: number;
  insurance_rate: number;
  social_insurance: number;
  other_deductions: number;
  net_salary: number;
  status: PayrollStatus;
  calculated_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemSettings {
  company_name: string;
  company_ips: string[];
  standard_work_days: number;
  paid_leave_days: number;
  default_insurance_rate: number;
  currency: string;
  timezone: string;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  employee_id: string | null;
  employee?: Pick<Employee, 'id' | 'name' | 'employee_code' | 'department' | 'position'> | null;
}

export interface PayrollInput {
  baseSalary: number;
  standardWorkDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  revenue: number;
  commissionRate: number;
  insuranceBase: number;
  insuranceRate: number;
  otherDeductions?: number;
}

export interface PayrollResult {
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  paidDays: number;
  dailySalary: number;
  baseSalaryPaid: number;
  revenue: number;
  commissionRate: number;
  commission: number;
  grossIncome: number;
  insuranceBase: number;
  insuranceRate: number;
  socialInsurance: number;
  otherDeductions: number;
  netSalary: number;
}

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}
