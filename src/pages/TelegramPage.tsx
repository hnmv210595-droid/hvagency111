import { useEffect, useState, type FormEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Modal,
  PageHeader,
  Table,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import type { TelegramGroup } from '@shared/types';

const emptyForm = {
  name: '',
  chat_id: '',
  enabled: true,
};

const MESSAGE_FORMAT_LINES = [
  'Tên NV: <b>…</b>',
  'Tháng: <b>MM/YYYY</b>',
  'Lương CB: <b>… VNĐ</b>',
  'HH: <b>… VNĐ</b>',
  'Nghỉ không lương: <b>…</b>',
  'Thực Nhận: <b>… VNĐ</b>',
];

export function TelegramPage() {
  const toast = useToast();
  const [rows, setRows] = useState<TelegramGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TelegramGroup | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ data: TelegramGroup[] }>('/api/telegram/admin/groups');
      setRows(res.data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải nhóm Telegram');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: TelegramGroup) {
    setEditing(row);
    setForm({
      name: row.name,
      chat_id: row.chat_id,
      enabled: row.enabled,
    });
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await api(`/api/telegram/admin/groups/${editing.id}`, {
          method: 'PUT',
          json: form,
        });
        toast.push('Đã cập nhật nhóm', 'success');
      } else {
        await api('/api/telegram/admin/groups', {
          method: 'POST',
          json: form,
        });
        toast.push('Đã thêm nhóm', 'success');
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi lưu', 'error');
    }
  }

  async function onDelete(row: TelegramGroup) {
    if (!confirm(`Xóa nhóm "${row.name}" (${row.chat_id})?`)) return;
    try {
      await api(`/api/telegram/admin/groups/${row.id}`, { method: 'DELETE' });
      toast.push('Đã xóa nhóm', 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi xóa', 'error');
    }
  }

  async function setupWebhook() {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; webhook_url: string }>(
        '/api/telegram/admin/setup-receive-webhook',
        { method: 'POST' },
      );
      toast.push(`Webhook OK: ${res.webhook_url}`, 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi webhook', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function sendPayroll() {
    if (!confirm('Gửi thử bảng lương tháng trước tới tất cả nhóm đang bật?')) return;
    setBusy(true);
    try {
      const res = await api<{
        data: {
          year: number;
          month: number;
          groups: number;
          sent: number;
          failed: number;
          errors: string[];
        };
      }>('/api/telegram/admin/send-payroll', { method: 'POST', json: {} });
      const d = res.data;
      toast.push(
        `Tháng ${String(d.month).padStart(2, '0')}/${d.year}: ${d.sent} tin OK, ${d.failed} lỗi, ${d.groups} nhóm`,
        d.failed > 0 ? 'error' : 'success',
      );
      if (d.errors?.length) {
        console.warn('Telegram send errors', d.errors);
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi gửi', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telegram"
        description="Quản lý nhóm nhận bảng lương ngày 1 hàng tháng"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void setupWebhook()}>
              Gắn webhook bot nhận
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void sendPayroll()}>
              Gửi thử lương
            </Button>
            <Button type="button" onClick={openCreate}>
              Thêm nhóm
            </Button>
          </div>
        }
      />

      <Card>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <MessageCircle size={16} />
          Format tin gửi (cố định)
        </div>
        <pre className="overflow-x-auto rounded-lg bg-brand-50 p-3 text-sm leading-relaxed dark:bg-brand-900/40">
          {MESSAGE_FORMAT_LINES.join('\n')}
        </pre>
        <p className="mt-2 text-xs text-muted dark:text-brand-300">
          Chat ID dạng số (thường âm), ví dụ <code>-5581029985</code> hoặc{' '}
          <code>-100xxxxxxxxxx</code>. Lấy ID: thêm bot nhận vào nhóm → gửi{' '}
          <code>/start</code> → copy Chat ID bot trả về.
        </p>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Chưa có nhóm" description="Thêm ít nhất một nhóm để gửi lương." />
      ) : (
        <Table>
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Tên nhóm</th>
              <th className="px-3 py-2 text-left">Chat ID</th>
              <th className="px-3 py-2 text-left">Trạng thái</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line dark:border-brand-800">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 font-mono text-sm">{row.chat_id}</td>
                <td className="px-3 py-2">
                  <Badge tone={row.enabled ? 'success' : 'neutral'}>
                    {row.enabled ? 'Bật' : 'Tắt'}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => openEdit(row)}>
                      Sửa
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void onDelete(row)}>
                      Xóa
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Sửa nhóm Telegram' : 'Thêm nhóm Telegram'}
      >
        <form className="grid gap-3" onSubmit={onSubmit}>
          <div>
            <Label>Tên nhóm</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VD: TWO DIGITAL - MONEY"
              required
            />
          </div>
          <div>
            <Label>Chat ID</Label>
            <Input
              value={form.chat_id}
              onChange={(e) => setForm((f) => ({ ...f, chat_id: e.target.value.trim() }))}
              placeholder="-5581029985"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            Bật gửi lương vào nhóm này
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit">{editing ? 'Lưu' : 'Thêm'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
