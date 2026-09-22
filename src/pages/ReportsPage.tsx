import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { currentYearMonth, formatVnd } from '@/lib/utils';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  Table,
} from '@/components/ui';

export function ReportsPage() {
  const { year, month } = currentYearMonth();
  const [period, setPeriod] = useState({ year, month });
  const [data, setData] = useState<{
    data: Array<Record<string, unknown>>;
    totals: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api<{ data: Array<Record<string, unknown>>; totals: Record<string, number> }>(
      `/api/reports?year=${period.year}&month=${period.month}`,
    )
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        description="Tổng hợp bảng lương theo kỳ"
        actions={
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
        }
      />

      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}

      {data ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="!p-4">
              <p className="text-xs text-muted">Thực nhận</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(data.totals.net_salary)}</p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-muted">Doanh thu</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(data.totals.revenue)}</p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-muted">Hoa hồng</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(data.totals.commission)}</p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-muted">BHXH</p>
              <p className="mt-1 text-lg font-semibold">{formatVnd(data.totals.social_insurance)}</p>
            </Card>
          </div>

          {data.data.length === 0 ? (
            <EmptyState title="Chưa có dữ liệu báo cáo" />
          ) : (
            <Table>
              <thead className="bg-brand-50/70 text-xs uppercase text-muted dark:bg-brand-900/40">
                <tr>
                  <th className="px-3 py-2">Nhân viên</th>
                  <th className="px-3 py-2">Phòng ban</th>
                  <th className="px-3 py-2">Ngày công</th>
                  <th className="px-3 py-2">Gross</th>
                  <th className="px-3 py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={String(row.id)} className="border-t border-line dark:border-brand-800">
                    <td className="px-3 py-2">{String(row.employee_name)}</td>
                    <td className="px-3 py-2">{String(row.department ?? '—')}</td>
                    <td className="px-3 py-2">{String(row.paid_days)}</td>
                    <td className="px-3 py-2">{formatVnd(Number(row.gross_income))}</td>
                    <td className="px-3 py-2 font-medium">{formatVnd(Number(row.net_salary))}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      ) : null}
    </div>
  );
}
