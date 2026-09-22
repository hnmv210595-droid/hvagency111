import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentYearMonth, formatVnd } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/ui';
import { useToast } from '@/components/toast';

export function DashboardPage() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') return <AdminDashboard />;
  return <EmployeeDashboard />;
}

function AdminDashboard() {
  const { year, month } = currentYearMonth();
  const [period, setPeriod] = useState({ year, month });
  const [data, setData] = useState<{
    stats: Record<string, number>;
    chart: Array<{ label: string; payroll: number; revenue: number }>;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{
      stats: Record<string, number>;
      chart: Array<{ label: string; payroll: number; revenue: number }>;
    }>(`/api/dashboard/admin?year=${period.year}&month=${period.month}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Tổng quan nhân sự, quỹ lương và doanh thu"
        actions={
          <div className="flex gap-2">
            <select
              className="h-10 rounded-lg border border-line bg-white px-3 text-sm dark:bg-brand-950 dark:border-brand-700"
              value={period.month}
              onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) }))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Tháng {i + 1}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="h-10 w-24 rounded-lg border border-line bg-white px-3 text-sm dark:bg-brand-950 dark:border-brand-700"
              value={period.year}
              onChange={(e) => setPeriod((p) => ({ ...p, year: Number(e.target.value) }))}
            />
          </div>
        }
      />

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Tổng nhân viên" value={String(data.stats.total_employees)} />
            <Stat label="Đang làm" value={String(data.stats.active_employees)} />
            <Stat label="Tổng quỹ lương" value={formatVnd(data.stats.total_payroll)} />
            <Stat label="Tổng doanh thu" value={formatVnd(data.stats.total_revenue)} />
            <Stat label="Tổng hoa hồng" value={formatVnd(data.stats.total_commission)} />
            <Stat label="Tổng BHXH" value={formatVnd(data.stats.total_insurance)} />
            <Stat label="Tổng ngày công" value={String(data.stats.total_work_days)} />
          </div>

          <Card className="mt-6" title="Doanh thu & quỹ lương (6 tháng)">
            {data.chart.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu biểu đồ" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.chart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                    <Tooltip formatter={(v) => formatVnd(Number(v))} />
                    <Legend />
                    <Bar dataKey="revenue" name="Doanh thu" fill="#357f6b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="payroll" name="Quỹ lương" fill="#7bbba4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function EmployeeDashboard() {
  const toast = useToast();
  const { year, month } = currentYearMonth();
  const [data, setData] = useState<{
    stats: {
      present_days: number;
      paid_leave_days: number;
      paid_days: number;
      base_salary: number;
      revenue: number;
      commission_rate: number;
      commission: number;
      net_salary: number | null;
    };
    settings: { standard_work_days: number; paid_leave_days: number };
    today_attendance: { check_in: string | null; check_out: string | null } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api<typeof data extends infer T ? NonNullable<T> : never>(
        `/api/dashboard/employee?year=${year}&month=${month}`,
      );
      setData(res);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function checkIn() {
    setBusy(true);
    try {
      await api('/api/attendance/check-in', { method: 'POST' });
      toast.push('Check-in thành công', 'success');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi check-in', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    setBusy(true);
    try {
      await api('/api/attendance/check-out', { method: 'POST' });
      toast.push('Check-out thành công', 'success');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi check-out', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState title="Không có dữ liệu" />;

  const checkedIn = Boolean(data.today_attendance?.check_in);
  const checkedOut = Boolean(data.today_attendance?.check_out);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ngày công, doanh thu và lương tháng hiện tại"
        actions={
          <div className="flex gap-2">
            <Button disabled={busy || checkedIn} onClick={checkIn}>
              Check-in
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !checkedIn || checkedOut}
              onClick={checkOut}
            >
              Check-out
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={checkedIn ? 'success' : 'warning'}>
          {checkedIn ? `Đã check-in ${data.today_attendance?.check_in?.slice(11) ?? ''}` : 'Chưa check-in'}
        </Badge>
        {checkedOut ? <Badge tone="brand">Đã check-out</Badge> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Ngày công"
          value={`${data.stats.paid_days} / ${data.settings.standard_work_days}`}
        />
        <Stat
          label="Nghỉ có lương"
          value={`${data.stats.paid_leave_days} / ${data.settings.paid_leave_days}`}
        />
        <Stat label="Lương cơ bản" value={formatVnd(data.stats.base_salary)} />
        <Stat label="Doanh thu" value={formatVnd(data.stats.revenue)} />
        <Stat label="% doanh thu" value={`${data.stats.commission_rate}%`} />
        <Stat label="Hoa hồng" value={formatVnd(data.stats.commission)} />
        <Stat
          label="Lương thực nhận"
          value={data.stats.net_salary != null ? formatVnd(data.stats.net_salary) : 'Chưa tính'}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="!p-4">
      <p className="text-xs uppercase tracking-wide text-muted dark:text-brand-300">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}
