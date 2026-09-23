import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentYearMonth, formatVnd } from '@/lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  Table,
} from '@/components/ui';
import { useToast } from '@/components/toast';

interface PayrollRow {
  id?: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  base_salary: number;
  standard_work_days: number;
  present_days?: number;
  presentDays?: number;
  paid_leave_days?: number;
  paidLeaveDays?: number;
  unpaid_leave_days?: number;
  unpaidLeaveDays?: number;
  paid_days?: number;
  paidDays?: number;
  base_salary_paid?: number;
  baseSalaryPaid?: number;
  revenue: number;
  commission_rate?: number;
  commissionRate?: number;
  commission: number;
  gross_income?: number;
  grossIncome?: number;
  insurance_base?: number;
  insuranceBase?: number;
  insurance_rate?: number;
  insuranceRate?: number;
  social_insurance?: number;
  socialInsurance?: number;
  other_deductions?: number;
  otherDeductions?: number;
  net_salary?: number;
  netSalary?: number;
  status?: string;
}

function n(row: PayrollRow, a: keyof PayrollRow, b: keyof PayrollRow) {
  return Number(row[a] ?? row[b] ?? 0);
}

function EmployeePayrollView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<{
    current: { label: string; data: PayrollRow; source: string };
    previous: { label: string; data: PayrollRow; source: string };
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    api<{
      current: { label: string; data: PayrollRow; source: string };
      previous: { label: string; data: PayrollRow; source: string };
    }>('/api/payroll/my-summary')
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'Lỗi tải lương'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!summary) return <EmptyState title="Chưa có dữ liệu lương" />;

  const cards = [
    { title: `Tháng này (${summary.current.label})`, period: summary.current, hint: 'Ước tính đến hôm nay' },
    {
      title: `Tháng trước (${summary.previous.label})`,
      period: summary.previous,
      hint: summary.previous.source === 'payroll' ? 'Theo bảng lương' : 'Ước tính',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Lương của tôi"
        description="Chỉ xem lương và hoa hồng của bạn — tháng này (đến hôm nay) và tháng trước"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => {
          const row = card.period.data;
          return (
            <section
              key={card.title}
              className="rounded-2xl border border-line/80 bg-white/80 p-5 dark:bg-brand-950/40 dark:border-brand-800"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">{card.title}</h2>
                <Badge tone="brand">{card.hint}</Badge>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Ngày công tính lương</dt>
                  <dd className="font-medium">
                    {n(row, 'paid_days', 'paidDays')}/{row.standard_work_days}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Lương cơ bản hưởng</dt>
                  <dd className="font-medium">
                    {formatVnd(n(row, 'base_salary_paid', 'baseSalaryPaid'))}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Doanh thu</dt>
                  <dd className="font-medium">{formatVnd(row.revenue)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Hoa hồng</dt>
                  <dd className="font-medium">{formatVnd(row.commission)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-2 dark:border-brand-800">
                  <dt className="font-medium">Thực nhận (ước tính)</dt>
                  <dd className="text-lg font-semibold">
                    {formatVnd(n(row, 'net_salary', 'netSalary'))}
                  </dd>
                </div>
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function PayrollPage() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') {
    return <EmployeePayrollView />;
  }
  return <AdminPayrollPage />;
}

function AdminPayrollPage() {
  const toast = useToast();
  const { year, month } = currentYearMonth();
  const [period, setPeriod] = useState({ year, month });
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [preview, setPreview] = useState<PayrollRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ data: PayrollRow[] }>(
        `/api/payroll?year=${period.year}&month=${period.month}&limit=100`,
      );
      setRows(res.data);
      setPreview(null);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải bảng lương');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [period]);

  async function calculate(isPreview: boolean) {
    setBusy(true);
    try {
      const res = await api<{ data: PayrollRow[] }>('/api/payroll/calculate', {
        method: 'POST',
        json: { year: period.year, month: period.month, preview: isPreview },
      });
      if (isPreview) {
        setPreview(res.data);
        toast.push('Preview bảng lương', 'info');
      } else {
        toast.push('Đã tính bảng lương', 'success');
        await load();
      }
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi tính lương', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function lock(id: string) {
    try {
      await api(`/api/payroll/${id}/lock`, { method: 'POST' });
      toast.push('Đã khóa', 'success');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  }

  async function unlock(id: string) {
    try {
      await api(`/api/payroll/${id}/unlock`, { method: 'POST' });
      toast.push('Đã mở khóa', 'success');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  }

  async function lockPeriod() {
    try {
      await api('/api/payroll/lock-period', {
        method: 'POST',
        json: { year: period.year, month: period.month },
      });
      toast.push('Đã khóa cả kỳ', 'success');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi', 'error');
    }
  }

  const display = preview ?? rows;

  return (
    <div>
      <PageHeader
        title="Bảng lương"
        description="Tính lương theo ngày công, hoa hồng và BHXH cấu hình"
        actions={
          <div className="flex flex-wrap gap-2">
            <Select
              className="w-32"
              value={period.month}
              onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) }))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Tháng {i + 1}
                </option>
              ))}
            </Select>
            <Button variant="secondary" disabled={busy} onClick={() => void calculate(true)}>
              Preview
            </Button>
            <Button disabled={busy} onClick={() => void calculate(false)}>
              Calculate
            </Button>
            <Button variant="secondary" onClick={() => void lockPeriod()}>
              Lock kỳ
            </Button>
          </div>
        }
      />

      {preview ? (
        <div className="mb-3">
          <Badge tone="warning">Đang xem preview — chưa lưu</Badge>
        </div>
      ) : null}

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && display.length === 0 ? <EmptyState title="Chưa có bảng lương" /> : null}

      {display.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
              <tr>
                <th className="px-2 py-2">NV</th>
                <th className="px-2 py-2">LCB</th>
                <th className="px-2 py-2">Công</th>
                <th className="px-2 py-2">Lương hưởng</th>
                <th className="px-2 py-2">DT</th>
                <th className="px-2 py-2">HH</th>
                <th className="px-2 py-2">BHXH</th>
                <th className="px-2 py-2">Thực nhận</th>
                <th className="px-2 py-2">TT</th>
                {!preview ? <th className="px-2 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {display.map((row) => (
                <tr
                  key={row.id ?? row.employee_id}
                  className="border-t border-line dark:border-brand-800"
                >
                  <td className="px-2 py-2">
                    <div className="font-medium">{row.employee_name ?? row.employee_code}</div>
                    <div className="text-xs text-muted">
                      P {n(row, 'present_days', 'presentDays')} · PL{' '}
                      {n(row, 'paid_leave_days', 'paidLeaveDays')} · UPL{' '}
                      {n(row, 'unpaid_leave_days', 'unpaidLeaveDays')}
                    </div>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatVnd(row.base_salary)}</td>
                  <td className="px-2 py-2">
                    {n(row, 'paid_days', 'paidDays')}/{row.standard_work_days}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatVnd(n(row, 'base_salary_paid', 'baseSalaryPaid'))}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatVnd(row.revenue)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatVnd(row.commission)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatVnd(n(row, 'social_insurance', 'socialInsurance'))}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap font-semibold">
                    {formatVnd(n(row, 'net_salary', 'netSalary'))}
                  </td>
                  <td className="px-2 py-2">
                    {row.status ? (
                      <Badge tone={row.status === 'LOCKED' ? 'danger' : 'brand'}>{row.status}</Badge>
                    ) : (
                      <Badge tone="warning">PREVIEW</Badge>
                    )}
                  </td>
                  {!preview && row.id ? (
                    <td className="px-2 py-2">
                      {row.status === 'LOCKED' ? (
                        <Button size="sm" variant="ghost" onClick={() => void unlock(row.id!)}>
                          Unlock
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => void lock(row.id!)}>
                          Lock
                        </Button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
