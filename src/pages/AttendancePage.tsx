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

interface MakeupRequestRow {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  review_note: string | null;
  created_at: string;
}

const emptyMakeupForm = { date: '', check_in: '08:00', check_out: '17:30', reason: '' };

const requestStatusLabel: Record<MakeupRequestRow['status'], string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

const requestStatusTone = (s: MakeupRequestRow['status']) =>
  s === 'APPROVED' ? 'success' : s === 'REJECTED' ? 'danger' : 'warning';

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
  const [requests, setRequests] = useState<MakeupRequestRow[]>([]);
  const [makeupOpen, setMakeupOpen] = useState(false);
  const [makeupForm, setMakeupForm] = useState(emptyMakeupForm);

  async function loadRequests() {
    try {
      const qs = user?.role === 'ADMIN' ? '?status=PENDING' : '';
      const res = await api<{ data: MakeupRequestRow[] }>(`/api/attendance/requests${qs}`);
      setRequests(res.data);
    } catch {
      setRequests([]);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ data: AttendanceRow[] }>(
        `/api/attendance?year=${period.year}&month=${period.month}&limit=200`,
      );
      setRows(res.data);
      setError('');
      void loadRequests();
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

  async function submitMakeup(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/attendance/requests', {
        method: 'POST',
        json: {
          date: makeupForm.date,
          check_in: makeupForm.check_in,
          check_out: makeupForm.check_out || null,
          reason: makeupForm.reason,
        },
      });
      toast.push('Đã gửi yêu cầu điểm danh bù, chờ Admin duyệt', 'success');
      setMakeupOpen(false);
      setMakeupForm(emptyMakeupForm);
      await loadRequests();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi', 'error');
    }
  }

  async function reviewRequest(row: MakeupRequestRow, action: 'approve' | 'reject') {
    let review_note: string | null = null;
    if (action === 'reject') {
      const input = prompt(`Lý do từ chối yêu cầu của ${row.employee_name ?? ''} (${row.date}):`, '');
      if (input === null) return;
      review_note = input.trim() || null;
    } else if (!confirm(`Duyệt điểm danh bù ngày ${row.date} cho ${row.employee_name ?? ''}?`)) {
      return;
    }
    try {
      await api(`/api/attendance/requests/${row.id}/${action}`, {
        method: 'POST',
        json: { review_note },
      });
      toast.push(action === 'approve' ? 'Đã duyệt' : 'Đã từ chối', 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi', 'error');
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
          <Button
            className="h-14 text-base sm:col-span-2"
            variant="secondary"
            disabled={busy}
            onClick={() => setMakeupOpen(true)}
          >
            Điểm danh bù (cần Admin duyệt)
          </Button>
        </div>

        {requests.length > 0 ? (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold">Yêu cầu điểm danh bù của tôi</h3>
            <Table>
              <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
                <tr>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Out</th>
                  <th className="px-3 py-2">Lý do</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-line dark:border-brand-800">
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2">{r.check_in?.slice(11, 16) ?? '—'}</td>
                    <td className="px-3 py-2">{r.check_out?.slice(11, 16) ?? '—'}</td>
                    <td className="px-3 py-2">{r.reason}</td>
                    <td className="px-3 py-2">
                      <Badge tone={requestStatusTone(r.status)}>{requestStatusLabel[r.status]}</Badge>
                      {r.review_note ? (
                        <p className="mt-1 text-xs text-muted">{r.review_note}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : null}

        <Modal open={makeupOpen} onClose={() => setMakeupOpen(false)} title="Điểm danh bù">
          <form className="space-y-3" onSubmit={submitMakeup}>
            <div>
              <Label>Ngày cần bù</Label>
              <Input
                type="date"
                value={makeupForm.date}
                onChange={(e) => setMakeupForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Giờ vào</Label>
                <Input
                  type="time"
                  value={makeupForm.check_in}
                  onChange={(e) => setMakeupForm((f) => ({ ...f, check_in: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Giờ ra</Label>
                <Input
                  type="time"
                  value={makeupForm.check_out}
                  onChange={(e) => setMakeupForm((f) => ({ ...f, check_out: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Lý do</Label>
              <Input
                value={makeupForm.reason}
                onChange={(e) => setMakeupForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="VD: Quên check-in, mất mạng..."
                required
                minLength={3}
              />
            </div>
            <p className="text-xs text-muted">
              Chỉ bù cho ngày trong tháng này hoặc tháng trước. Yêu cầu chỉ có hiệu lực sau khi Admin
              duyệt.
            </p>
            <Button type="submit">Gửi yêu cầu</Button>
          </form>
        </Modal>

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

      {requests.length > 0 ? (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold">
            Yêu cầu điểm danh bù chờ duyệt ({requests.length})
          </h3>
          <Table>
            <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
              <tr>
                <th className="px-3 py-2">Nhân viên</th>
                <th className="px-3 py-2">Ngày</th>
                <th className="px-3 py-2">In</th>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Lý do</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-line dark:border-brand-800">
                  <td className="px-3 py-2">{r.employee_name}</td>
                  <td className="px-3 py-2">{r.date}</td>
                  <td className="px-3 py-2">{r.check_in?.slice(11, 16) ?? '—'}</td>
                  <td className="px-3 py-2">{r.check_out?.slice(11, 16) ?? '—'}</td>
                  <td className="px-3 py-2">{r.reason}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => void reviewRequest(r, 'approve')}>
                        Duyệt
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void reviewRequest(r, 'reject')}
                      >
                        Từ chối
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

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
