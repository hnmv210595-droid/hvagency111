import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentYearMonth, formatVnd, formatPercent } from '@/lib/utils';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Table,
} from '@/components/ui';
import { useToast } from '@/components/toast';

interface RevenueRow {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  commission_rate?: number;
  year: number;
  month: number;
  amount: number;
  note: string | null;
}

export function RevenuesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { year, month } = currentYearMonth();
  const [period, setPeriod] = useState({ year, month });
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    employee_id: '',
    year,
    month,
    amount: 0,
    note: '',
  });

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ data: RevenueRow[] }>(
        `/api/revenues?year=${period.year}&month=${period.month}&limit=100`,
      );
      setRows(res.data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải doanh thu');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [period]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api<{ data: Array<{ id: string; name: string }> }>('/api/employees?limit=100&status=ACTIVE').then(
        (res) => setEmployees(res.data.map((e) => ({ id: e.id, name: e.name }))),
      );
    }
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/revenues', {
        method: 'POST',
        json: {
          ...form,
          year: Number(form.year),
          month: Number(form.month),
          amount: Number(form.amount),
        },
      });
      toast.push('Đã lưu doanh thu', 'success');
      setOpen(false);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Doanh thu"
        description="Doanh thu theo tháng — dùng để tính hoa hồng"
        actions={
          <div className="flex gap-2">
            {user?.role === 'ADMIN' ? (
              <Button
                onClick={() => {
                  setForm((f) => ({ ...f, year: period.year, month: period.month }));
                  setOpen(true);
                }}
              >
                Nhập doanh thu
              </Button>
            ) : null}
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
          </div>
        }
      />

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && rows.length === 0 ? <EmptyState title="Chưa có doanh thu tháng này" /> : null}

      {rows.length > 0 ? (
        <Table>
          <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
            <tr>
              {user?.role === 'ADMIN' ? <th className="px-3 py-2">Nhân viên</th> : null}
              <th className="px-3 py-2">Kỳ</th>
              <th className="px-3 py-2">Doanh thu</th>
              <th className="px-3 py-2">% DT</th>
              <th className="px-3 py-2">Hoa hồng ước tính</th>
              <th className="px-3 py-2">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const commission = Math.round((row.amount * (row.commission_rate ?? 0)) / 100);
              return (
                <tr key={row.id} className="border-t border-line dark:border-brand-800">
                  {user?.role === 'ADMIN' ? (
                    <td className="px-3 py-2">{row.employee_name}</td>
                  ) : null}
                  <td className="px-3 py-2">
                    {row.year}-{String(row.month).padStart(2, '0')}
                  </td>
                  <td className="px-3 py-2 font-medium">{formatVnd(row.amount)}</td>
                  <td className="px-3 py-2">{formatPercent(row.commission_rate)}%</td>
                  <td className="px-3 py-2">{formatVnd(commission)}</td>
                  <td className="px-3 py-2">{row.note || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}

      <Modal open={open} onClose={() => setOpen(false)} title="Nhập doanh thu">
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <Label>Nhân viên</Label>
            <Select
              required
              value={form.employee_id}
              onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
            >
              <option value="">Chọn...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Năm</Label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Tháng</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={form.month}
                onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div>
            <Label>Số tiền (VNĐ)</Label>
            <Input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
              required
            />
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <Button type="submit">Lưu</Button>
        </form>
      </Modal>
    </div>
  );
}
