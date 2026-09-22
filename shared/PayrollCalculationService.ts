import type { PayrollInput, PayrollResult } from './types';

/**
 * Pure payroll calculation service.
 * Rules are driven by Admin configuration (standardWorkDays, paid leave policy, rates).
 * Not legal/tax advice — applies only the numbers configured in the system.
 */
export class PayrollCalculationService {
  static calculatePaidDays(input: {
    presentDays: number;
    paidLeaveDays: number;
    unpaidLeaveDays?: number;
    absentDays?: number;
  }): number {
    const present = Math.max(0, Math.floor(input.presentDays));
    const paidLeave = Math.max(0, Math.floor(input.paidLeaveDays));
    return present + paidLeave;
  }

  static calculateDailySalary(baseSalary: number, standardWorkDays: number): number {
    if (standardWorkDays <= 0) {
      throw new Error('standardWorkDays must be greater than 0');
    }
    if (baseSalary < 0) {
      throw new Error('baseSalary cannot be negative');
    }
    return baseSalary / standardWorkDays;
  }

  static calculateBaseSalaryPaid(
    baseSalary: number,
    paidDays: number,
    standardWorkDays: number,
  ): number {
    if (standardWorkDays <= 0) {
      throw new Error('standardWorkDays must be greater than 0');
    }
    const ratio = Math.min(paidDays / standardWorkDays, 1);
    const paid = baseSalary * ratio;
    return Math.min(paid, baseSalary);
  }

  static calculateCommission(revenue: number, commissionRate: number): number {
    if (revenue < 0 || commissionRate < 0) {
      throw new Error('revenue and commissionRate cannot be negative');
    }
    return (revenue * commissionRate) / 100;
  }

  static calculateSocialInsurance(insuranceBase: number, insuranceRate: number): number {
    if (insuranceBase < 0 || insuranceRate < 0) {
      throw new Error('insuranceBase and insuranceRate cannot be negative');
    }
    return (insuranceBase * insuranceRate) / 100;
  }

  static calculateGrossIncome(baseSalaryPaid: number, commission: number): number {
    return baseSalaryPaid + commission;
  }

  static calculateNetSalary(
    grossIncome: number,
    socialInsurance: number,
    otherDeductions = 0,
  ): number {
    return grossIncome - socialInsurance - otherDeductions;
  }

  /** Round to nearest VNĐ (integer) */
  static roundVnd(amount: number): number {
    return Math.round(amount);
  }

  static calculate(input: PayrollInput): PayrollResult {
    const presentDays = Math.max(0, Math.floor(input.presentDays));
    const paidLeaveDays = Math.max(0, Math.floor(input.paidLeaveDays));
    const unpaidLeaveDays = Math.max(0, Math.floor(input.unpaidLeaveDays));
    const absentDays = Math.max(0, Math.floor(input.absentDays));
    const otherDeductions = Math.max(0, input.otherDeductions ?? 0);

    const paidDays = this.calculatePaidDays({
      presentDays,
      paidLeaveDays,
      unpaidLeaveDays,
      absentDays,
    });

    const dailySalary = this.calculateDailySalary(input.baseSalary, input.standardWorkDays);
    const baseSalaryPaid = this.calculateBaseSalaryPaid(
      input.baseSalary,
      paidDays,
      input.standardWorkDays,
    );
    const commission = this.calculateCommission(input.revenue, input.commissionRate);
    const grossIncome = this.calculateGrossIncome(baseSalaryPaid, commission);
    const socialInsurance = this.calculateSocialInsurance(
      input.insuranceBase,
      input.insuranceRate,
    );
    const netSalary = this.calculateNetSalary(grossIncome, socialInsurance, otherDeductions);

    return {
      presentDays,
      paidLeaveDays,
      unpaidLeaveDays,
      absentDays,
      paidDays,
      dailySalary: this.roundVnd(dailySalary),
      baseSalaryPaid: this.roundVnd(baseSalaryPaid),
      revenue: this.roundVnd(input.revenue),
      commissionRate: input.commissionRate,
      commission: this.roundVnd(commission),
      grossIncome: this.roundVnd(grossIncome),
      insuranceBase: this.roundVnd(input.insuranceBase),
      insuranceRate: input.insuranceRate,
      socialInsurance: this.roundVnd(socialInsurance),
      otherDeductions: this.roundVnd(otherDeductions),
      netSalary: this.roundVnd(netSalary),
    };
  }
}
