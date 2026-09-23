import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentYearMonth } from '@/lib/utils';
import {
  Badge,
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

interface AttendanceRow {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  ip: string | null;
  note: string | null;
}

export function AttendancePage() {
  const { user } = useAuth();
  const toast = useToast();
  const { year, month } = currentYearMonth();
  const [period, setPeriod] = useState({ year, month });
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<AttendanceRow | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [adminForm, setAdminForm] = useState({
    employee_id: '',
    date: '',
    status: 'PRESENT',
    note: '',
  });

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ data: AttendanceRow[] }>(
        `/api/attendance?year=${period.year}&month=${period.month}&limit=200`,
      );
      setRows(res.data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải điểm danh');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [period]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      api<{ data: Array<{ id: string; name: string }> }>('/api/employees?limit=100').then((res) =>
        setEmployees(res.data.map((e) => ({ id: e.id, name: e.name }))),
      );
    }
  }, [user]);

  async function checkIn() {
    setBusy(true);
    try {
      await api('/api/attendance/check-in', { method: 'POST' });
      toast.push('Check-in OK', 'success');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    setBusy(true);
    try {
      await api('/api/attendance/check-out', { method: 'POST' });
      toast.push('Check-out OK', 'success');
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function markLeave(status: 'PAID_LEAVE' | 'UNPAID_LEAVE') {
    setBusy(true);
    try {
      await api('/api/attendance/mark', { method: 'POST', json: { status } });
      toast.push(
        status === 'PAID_LEAVE' ? 'Đã ghi nghỉ có lương' : 'Đã ghi nghỉ không lương',
        'success',
      );
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    try {
      await api(`/api/attendance/${edit.id}`, {
        method: 'PUT',
        json: { status: edit.status, note: edit.note, check_in: edit.check_in, check_out: edit.check_out },
      });
      toast.push('Đã cập nhật điểm danh', 'success');
      setEdit(null);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi', 'error');
    }
  }

  async function saveAdmin(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/attendance/admin', { method: 'POST', json: adminForm });
      toast.push('Đã lưu điểm danh', 'success');
      setAdminOpen(false);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi', 'error');
    }
  }

  const tone = (s: string) =>
    s === 'PRESENT' ? 'success' : s === 'PAID_LEAVE' ? 'brand' : s === 'UNPAID_LEAVE' ? 'warning' : 'danger';

  const todayRow = rows.find((r) => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return r.date === fmt.format(new Date());
  });

  if (user?.role === 'EMPLOYEE') {
    return (
      <div>
        <PageHeader
          title="Điểm danh"
          description="Chấm công hôm nay và xem lịch sử ngày công của bạn"
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Button className="h-14 text-base" disabled={busy} onClick={checkIn}>
            Điểm danh (Check-in)
          </Button>
          <Button
            className="h-14 text-base"
            variant="secondary"
            disabled={busy}
            onClick={checkOut}
          >
            Check-out
          </Button>
          <Button
            className="h-14 text-base"
            variant="secondary"
            disabled={busy}
            onClick={() => void markLeave('PAID_LEAVE')}
          >
            Nghỉ có lương
          </Button>
          <Button
            className="h-14 text-base"
            variant="secondary"
            disabled={busy}
            onClick={() => void markLeave('UNPAID_LEAVE')}
          >
            Nghỉ không lương
          </Button>
        </div>

        {todayRow ? (
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <Badge tone={tone(todayRow.status) as 'success'}>Hôm nay: {todayRow.status}</Badge>
            {todayRow.check_in ? <Badge tone="brand">In {todayRow.check_in.slice(11)}</Badge> : null}
            {todayRow.check_out ? (
              <Badge tone="brand">Out {todayRow.check_out.slice(11)}</Badge>
            ) : null}
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted">Chưa có trạng thái hôm nay</p>
        )}

        <div className="mb-4">
          <Select
            className="w-40"
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

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!loading && rows.length === 0 ? <EmptyState title="Chưa có dữ liệu điểm danh" /> : null}

        {rows.length > 0 ? (
          <Table>
            <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
              <tr>
                <th className="px-3 py-2">Ngày</th>
                <th className="px-3 py-2">In</th>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line dark:border-brand-800">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.check_in?.slice(11) ?? '—'}</td>
                  <td className="px-3 py-2">{row.check_out?.slice(11) ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={tone(row.status) as 'success'}>{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Điểm danh"
        description="Check-in / check-out và quản lý ngày công"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAdminOpen(true)}>Nhập điểm danh</Button>
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
      {!loading && rows.length === 0 ? <EmptyState title="Chưa có dữ liệu điểm danh" /> : null}

      {rows.length > 0 ? (
        <Table>
          <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
            <tr>
              {user?.role === 'ADMIN' ? <th className="px-3 py-2">Nhân viên</th> : null}
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">In</th>
              <th className="px-3 py-2">Out</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">IP</th>
              {user?.role === 'ADMIN' ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line dark:border-brand-800">
                {user?.role === 'ADMIN' ? (
                  <td className="px-3 py-2">{row.employee_name}</td>
                ) : null}
                <td className="px-3 py-2">{row.date}</td>
                <td className="px-3 py-2">{row.check_in?.slice(11) ?? '—'}</td>
                <td className="px-3 py-2">{row.check_out?.slice(11) ?? '—'}</td>
                <td className="px-3 py-2">
                  <Badge tone={tone(row.status) as 'success'}>{row.status}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">{row.ip || '—'}</td>
                {user?.role === 'ADMIN' ? (
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(row)}>
                      Sửa
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title="Điều chỉnh điểm danh">
        {edit ? (
          <form className="space-y-3" onSubmit={saveEdit}>
            <div>
              <Label>Trạng thái</Label>
              <Select
                value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value })}
              >
                <option value="PRESENT">PRESENT</option>
                <option value="PAID_LEAVE">PAID_LEAVE</option>
                <option value="UNPAID_LEAVE">UNPAID_LEAVE</option>
                <option value="ABSENT">ABSENT</option>
              </Select>
            </div>
            <div>
              <Label>Ghi chú</Label>
              <Input
                value={edit.note ?? ''}
                onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              />
            </div>
            <Button type="submit">Lưu</Button>
          </form>
        ) : null}
      </Modal>

      <Modal open={adminOpen} onClose={() => setAdminOpen(false)} title="Nhập điểm danh">
        <form className="space-y-3" onSubmit={saveAdmin}>
          <div>
            <Label>Nhân viên</Label>
            <Select
              value={adminForm.employee_id}
              onChange={(e) => setAdminForm((f) => ({ ...f, employee_id: e.target.value }))}
              required
            >
              <option value="">Chọn...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Ngày</Label>
            <Input
              type="date"
              value={adminForm.date}
              onChange={(e) => setAdminForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>Trạng thái</Label>
            <Select
              value={adminForm.status}
              onChange={(e) => setAdminForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="PRESENT">PRESENT</option>
              <option value="PAID_LEAVE">PAID_LEAVE</option>
              <option value="UNPAID_LEAVE">UNPAID_LEAVE</option>
              <option value="ABSENT">ABSENT</option>
            </Select>
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Input
              value={adminForm.note}
              onChange={(e) => setAdminForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <Button type="submit">Lưu</Button>
        </form>
      </Modal>
    </div>
  );
}
