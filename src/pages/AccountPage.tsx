import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatVnd } from '@/lib/utils';
import { Card, ErrorState, LoadingState, PageHeader, Badge } from '@/components/ui';
import type { Employee } from '@shared/types';

export function AccountPage() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.employee_id) {
      setLoading(false);
      return;
    }
    api<{ data: Employee }>(`/api/employees/${user.employee_id}`)
      .then((res) => setEmployee(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader title="Tài khoản" description="Hồ sơ cá nhân" />
      {!employee ? (
        <Card>
          <p className="font-medium">{user?.username}</p>
          <p className="text-sm text-muted">Role: {user?.role}</p>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{employee.name}</h2>
              <p className="text-sm text-muted">{employee.employee_code}</p>
            </div>
            <Badge tone={employee.status === 'ACTIVE' ? 'success' : 'danger'}>
              {employee.status}
            </Badge>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <Item label="Username" value={employee.username} />
            <Item label="Email" value={employee.email || '—'} />
            <Item label="SĐT" value={employee.phone || '—'} />
            <Item label="Phòng ban" value={employee.department || '—'} />
            <Item label="Chức vụ" value={employee.position || '—'} />
            <Item label="Ngày vào" value={employee.start_date || '—'} />
            <Item label="Lương cơ bản" value={formatVnd(employee.base_salary)} />
            <Item label="% doanh thu" value={`${employee.commission_rate}%`} />
            <Item label="Căn cứ BHXH" value={formatVnd(employee.insurance_base)} />
            <Item label="% BHXH" value={`${employee.insurance_rate}%`} />
          </dl>
        </Card>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/70 px-3 py-2 dark:border-brand-800">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
