import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  Table,
  Button,
} from '@/components/ui';

interface AuditRow {
  id: string;
  username?: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  timestamp: string;
  metadata: string | null;
}

export function AuditLogsPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (action) params.set('action', action);
    api<{ data: AuditRow[]; total: number }>(`/api/audit-logs?${params}`)
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, action]);

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Nhật ký thao tác quan trọng"
        actions={
          <Select
            className="w-52"
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
          >
            <option value="">Tất cả action</option>
            {[
              'LOGIN',
              'CREATE_USER',
              'UPDATE_USER',
              'DISABLE_USER',
              'RESET_PASSWORD',
              'UPDATE_SALARY',
              'UPDATE_REVENUE',
              'UPDATE_ATTENDANCE',
              'CALCULATE_PAYROLL',
              'LOCK_PAYROLL',
              'UPDATE_SETTINGS',
            ].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        }
      />

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && rows.length === 0 ? <EmptyState title="Chưa có audit log" /> : null}

      {rows.length > 0 ? (
        <>
          <Table>
            <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
              <tr>
                <th className="px-3 py-2">Thời gian</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line dark:border-brand-800">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.timestamp}</td>
                  <td className="px-3 py-2">{row.username || '—'}</td>
                  <td className="px-3 py-2 font-medium">{row.action}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.target_type}/{row.target_id}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span>
              {total} logs · trang {page}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Trước
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page * 50 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
