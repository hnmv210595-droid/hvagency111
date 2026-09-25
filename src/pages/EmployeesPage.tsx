import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/utils';
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
import type { Employee } from '@shared/types';

const emptyForm = {
  employee_code: '',
  name: '',
  username: '',
  email: '',
  phone: '',
  department: '',
  position: '',
  start_date: '',
  base_salary: 0,
  commission_rate: 0,
  insurance_rate: 0,
  insurance_base: 0,
  password: '',
  status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
};

export function EmployeesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      const res = await api<{ data: Employee[]; total: number }>(`/api/employees?${params}`);
      setRows(res.data);
      setTotal(res.total);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải nhân viên');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, status]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({
      employee_code: emp.employee_code,
      name: emp.name,
      username: emp.username,
      email: emp.email ?? '',
      phone: emp.phone ?? '',
      department: emp.department ?? '',
      position: emp.position ?? '',
      start_date: emp.start_date ?? '',
      base_salary: emp.base_salary,
      commission_rate: emp.commission_rate,
      insurance_rate: emp.insurance_rate,
      insurance_base: emp.insurance_base,
      password: '',
      status: emp.status,
    });
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        email: form.email || null,
        base_salary: Number(form.base_salary),
        commission_rate: Number(form.commission_rate),
        insurance_rate: Number(form.insurance_rate),
        insurance_base: Number(form.insurance_base),
        password: form.password || undefined,
      };
      if (editing) {
        await api(`/api/employees/${editing.id}`, { method: 'PUT', json: payload });
        toast.push('Đã cập nhật nhân viên', 'success');
      } else {
        await api('/api/employees', { method: 'POST', json: payload });
        toast.push('Đã tạo nhân viên', 'success');
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi lưu', 'error');
    }
  }

  async function deleteEmployee(emp: Employee) {
    const ok = confirm(
      `Xóa nhân viên "${emp.name}" (${emp.employee_code})?\n\nTài khoản sẽ bị khóa, không đăng nhập được. Dữ liệu chấm công/lương vẫn được giữ.`,
    );
    if (!ok) return;
    try {
      await api(`/api/employees/${emp.id}`, { method: 'DELETE' });
      toast.push('Đã xóa nhân viên', 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi xóa nhân viên', 'error');
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetId) return;
    try {
      await api(`/api/employees/${resetId}/reset-password`, {
        method: 'POST',
        json: { password: newPassword },
      });
      toast.push('Đã reset mật khẩu', 'success');
      setResetId(null);
      setNewPassword('');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi reset', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Nhân viên"
        description="Quản lý hồ sơ, lương, hoa hồng và BHXH"
        actions={<Button onClick={openCreate}>Thêm nhân viên</Button>}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Tìm tên, mã, username..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              void load();
            }
          }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="sm:w-40"
        >
          <option value="">Tất cả</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </Select>
        <Button
          variant="secondary"
          onClick={() => {
            setPage(1);
            void load();
          }}
        >
          Tìm
        </Button>
      </div>

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="Chưa có nhân viên" description="Tạo nhân viên đầu tiên để bắt đầu." />
      ) : null}

      {rows.length > 0 ? (
        <>
          <Table>
            <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
              <tr>
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Họ tên</th>
                <th className="px-3 py-2">Phòng ban</th>
                <th className="px-3 py-2">Lương CB</th>
                <th className="px-3 py-2">% DT</th>
                <th className="px-3 py-2">TT</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => (
                <tr key={emp.id} className="border-t border-line dark:border-brand-800">
                  <td className="px-3 py-2 font-medium">{emp.employee_code}</td>
                  <td className="px-3 py-2">
                    <div>{emp.name}</div>
                    <div className="text-xs text-muted">{emp.username}</div>
                  </td>
                  <td className="px-3 py-2">{emp.department || '—'}</td>
                  <td className="px-3 py-2">{formatVnd(emp.base_salary)}</td>
                  <td className="px-3 py-2">{emp.commission_rate}%</td>
                  <td className="px-3 py-2">
                    <Badge tone={emp.status === 'ACTIVE' ? 'success' : 'danger'}>{emp.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(emp)}>
                        Sửa
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetId(emp.id)}>
                        Reset MK
                      </Button>
                      {emp.status === 'ACTIVE' ? (
                        <Button size="sm" variant="danger" onClick={() => void deleteEmployee(emp)}>
                          Xóa
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span>
              {total} nhân viên · trang {page}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trước
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </>
      ) : null}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Sửa nhân viên' : 'Thêm nhân viên'}>
        <form className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2" onSubmit={onSubmit}>
          {(
            [
              ['employee_code', 'Mã NV'],
              ['name', 'Họ tên'],
              ['username', 'Username'],
              ['email', 'Email'],
              ['phone', 'SĐT'],
              ['department', 'Phòng ban'],
              ['position', 'Chức vụ'],
              ['start_date', 'Ngày vào'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                type={key === 'start_date' ? 'date' : 'text'}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                required={key === 'employee_code' || key === 'name' || key === 'username'}
              />
            </div>
          ))}
          <div>
            <Label>Lương cơ bản</Label>
            <Input
              type="number"
              value={form.base_salary}
              onChange={(e) => setForm((f) => ({ ...f, base_salary: Number(e.target.value) }))}
              required
            />
          </div>
          <div>
            <Label>% doanh thu</Label>
            <Input
              type="number"
              step="0.01"
              value={form.commission_rate}
              onChange={(e) => setForm((f) => ({ ...f, commission_rate: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>Căn cứ BHXH</Label>
            <Input
              type="number"
              value={form.insurance_base}
              onChange={(e) => setForm((f) => ({ ...f, insurance_base: Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label>% BHXH</Label>
            <Input
              type="number"
              step="0.01"
              value={form.insurance_rate}
              onChange={(e) => setForm((f) => ({ ...f, insurance_rate: Number(e.target.value) }))}
            />
          </div>
          {!editing ? (
            <div className="sm:col-span-2">
              <Label>Mật khẩu ban đầu</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={8}
              />
            </div>
          ) : (
            <div>
              <Label>Trạng thái</Label>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'DISABLED' }))
                }
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="DISABLED">DISABLED</option>
              </Select>
            </div>
          )}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit">Lưu</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(resetId)} onClose={() => setResetId(null)} title="Reset mật khẩu">
        <form className="space-y-3" onSubmit={resetPassword}>
          <div>
            <Label>Mật khẩu mới</Label>
            <Input
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit">Reset</Button>
        </form>
      </Modal>
    </div>
  );
}
