import { describe, expect, it } from 'vitest';
import { PayrollCalculationService } from '../shared/PayrollCalculationService';
import { isIpAllowed, parseCompanyIps } from '../worker/lib/ip';

describe('PayrollCalculationService', () => {
  it('26 paid days gets full base salary', () => {
    const result = PayrollCalculationService.calculate({
      baseSalary: 10_000_000,
      standardWorkDays: 26,
      presentDays: 22,
      paidLeaveDays: 4,
      unpaidLeaveDays: 0,
      absentDays: 0,
      revenue: 0,
      commissionRate: 0,
      insuranceBase: 0,
      insuranceRate: 0,
    });
    expect(result.paidDays).toBe(26);
    expect(result.baseSalaryPaid).toBe(10_000_000);
    expect(result.netSalary).toBe(10_000_000);
  });

  it('24/26 prorates base salary', () => {
    const result = PayrollCalculationService.calculate({
      baseSalary: 10_000_000,
      standardWorkDays: 26,
      presentDays: 20,
      paidLeaveDays: 4,
      unpaidLeaveDays: 2,
      absentDays: 0,
      revenue: 0,
      commissionRate: 0,
      insuranceBase: 0,
      insuranceRate: 0,
    });
    expect(result.paidDays).toBe(24);
    expect(result.baseSalaryPaid).toBe(9_230_769);
  });

  it('paid leave beyond quota still counts in paid_days formula (policy tracked separately)', () => {
    const result = PayrollCalculationService.calculate({
      baseSalary: 10_000_000,
      standardWorkDays: 26,
      presentDays: 20,
      paidLeaveDays: 6,
      unpaidLeaveDays: 0,
      absentDays: 0,
      revenue: 0,
      commissionRate: 0,
      insuranceBase: 0,
      insuranceRate: 0,
    });
    expect(result.paidDays).toBe(26);
    expect(result.baseSalaryPaid).toBe(10_000_000);
  });

  it('never exceeds base salary when paid_days > standard', () => {
    const result = PayrollCalculationService.calculate({
      baseSalary: 10_000_000,
      standardWorkDays: 26,
      presentDays: 26,
      paidLeaveDays: 4,
      unpaidLeaveDays: 0,
      absentDays: 0,
      revenue: 0,
      commissionRate: 0,
      insuranceBase: 0,
      insuranceRate: 0,
    });
    expect(result.baseSalaryPaid).toBe(10_000_000);
  });

  it('calculates commission', () => {
    const commission = PayrollCalculationService.calculateCommission(100_000_000, 5);
    expect(commission).toBe(5_000_000);
  });

  it('calculates social insurance from insurance_base (not gross)', () => {
    const si = PayrollCalculationService.calculateSocialInsurance(10_000_000, 8);
    expect(si).toBe(800_000);
  });

  it('calculates full net salary example', () => {
    const result = PayrollCalculationService.calculate({
      baseSalary: 10_000_000,
      standardWorkDays: 26,
      presentDays: 26,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      absentDays: 0,
      revenue: 100_000_000,
      commissionRate: 5,
      insuranceBase: 10_000_000,
      insuranceRate: 8,
      otherDeductions: 0,
    });
    expect(result.commission).toBe(5_000_000);
    expect(result.grossIncome).toBe(15_000_000);
    expect(result.socialInsurance).toBe(800_000);
    expect(result.netSalary).toBe(14_200_000);
  });
});

describe('IP restriction helpers', () => {
  it('parses comma-separated company IPs for multi-IP support', () => {
    const ips = parseCompanyIps('115.76.54.149, 1.2.3.4', ['5.6.7.8']);
    expect(ips).toContain('115.76.54.149');
    expect(ips).toContain('1.2.3.4');
    expect(ips).toContain('5.6.7.8');
  });

  it('allows employee only from company IP', () => {
    const allowed = ['115.76.54.149'];
    expect(isIpAllowed('115.76.54.149', allowed)).toBe(true);
    expect(isIpAllowed('8.8.8.8', allowed)).toBe(false);
    expect(isIpAllowed('unknown', allowed)).toBe(false);
  });
});

describe('Auth / RBAC policy (unit)', () => {
  it('employee cannot access other employee ids', () => {
    const assertOwn = (role: string, ownId: string | null, targetId: string) => {
      if (role === 'ADMIN') return true;
      return ownId === targetId;
    };
    expect(assertOwn('EMPLOYEE', 'emp-1', 'emp-1')).toBe(true);
    expect(assertOwn('EMPLOYEE', 'emp-1', 'emp-2')).toBe(false);
    expect(assertOwn('ADMIN', null, 'emp-2')).toBe(true);
  });

  it('admin can login from any IP while employee cannot', () => {
    const canLogin = (role: 'ADMIN' | 'EMPLOYEE', ip: string, companyIps: string[]) => {
      if (role === 'ADMIN') return true;
      return isIpAllowed(ip, companyIps);
    };
    expect(canLogin('ADMIN', '8.8.8.8', ['115.76.54.149'])).toBe(true);
    expect(canLogin('EMPLOYEE', '8.8.8.8', ['115.76.54.149'])).toBe(false);
    expect(canLogin('EMPLOYEE', '115.76.54.149', ['115.76.54.149'])).toBe(true);
  });
});

describe('Attendance rules (unit)', () => {
  it('rejects double check-in and checkout without check-in', () => {
    const canCheckIn = (existing: { check_in: string | null } | null) => !existing?.check_in;
    const canCheckOut = (existing: { check_in: string | null; check_out: string | null } | null) =>
      Boolean(existing?.check_in) && !existing?.check_out;

    expect(canCheckIn(null)).toBe(true);
    expect(canCheckIn({ check_in: '2026-01-01T08:00:00' })).toBe(false);
    expect(canCheckOut(null)).toBe(false);
    expect(canCheckOut({ check_in: null, check_out: null })).toBe(false);
    expect(canCheckOut({ check_in: '08:00', check_out: null })).toBe(true);
    expect(canCheckOut({ check_in: '08:00', check_out: '17:00' })).toBe(false);
  });
});
