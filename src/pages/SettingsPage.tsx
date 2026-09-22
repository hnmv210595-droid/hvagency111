import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import {
  Button,
  Card,
  ErrorState,
  Input,
  Label,
  LoadingState,
  PageHeader,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import type { SystemSettings } from '@shared/types';

export function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState<SystemSettings | null>(null);
  const [ipsText, setIpsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ data: SystemSettings }>('/api/settings')
      .then((res) => {
        setForm(res.data);
        setIpsText(res.data.company_ips.join('\n'));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      const company_ips = ipsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api<{ data: SystemSettings }>('/api/settings', {
        method: 'PUT',
        json: {
          company_name: form.company_name,
          company_ips,
          standard_work_days: Number(form.standard_work_days),
          paid_leave_days: Number(form.paid_leave_days),
          default_insurance_rate: Number(form.default_insurance_rate),
          currency: form.currency,
          timezone: form.timezone,
        },
      });
      setForm(res.data);
      setIpsText(res.data.company_ips.join('\n'));
      toast.push('Đã lưu cài đặt', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Lỗi lưu', 'error');
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!form) return null;

  return (
    <div>
      <PageHeader
        title="Cài đặt"
        description="Cấu hình công ty, IP, ngày công và tham số lương"
      />
      <Card>
        <form className="grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <div className="sm:col-span-2">
            <Label>Tên công ty</Label>
            <Input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Company IP (mỗi dòng hoặc cách bằng dấu phẩy)</Label>
            <textarea
              className="min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm dark:bg-brand-950/40 dark:border-brand-700"
              value={ipsText}
              onChange={(e) => setIpsText(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Ngày công chuẩn</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={form.standard_work_days}
              onChange={(e) =>
                setForm({ ...form, standard_work_days: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>Nghỉ có lương (ngày)</Label>
            <Input
              type="number"
              min={0}
              max={31}
              value={form.paid_leave_days}
              onChange={(e) => setForm({ ...form, paid_leave_days: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>% BHXH mặc định</Label>
            <Input
              type="number"
              step="0.01"
              value={form.default_insurance_rate}
              onChange={(e) =>
                setForm({ ...form, default_insurance_rate: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>Tiền tệ</Label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Timezone</Label>
            <Input
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Lưu cài đặt</Button>
          </div>
        </form>
        <p className="mt-4 text-xs text-muted dark:text-brand-300">
          Quy tắc lương/BHXH chỉ áp dụng theo cấu hình Admin — không phải tư vấn pháp lý.
        </p>
      </Card>
    </div>
  );
}
