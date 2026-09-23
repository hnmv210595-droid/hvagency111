import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/toast';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { RevenuesPage } from '@/pages/RevenuesPage';
import { PayrollPage } from '@/pages/PayrollPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { LoadingState } from '@/components/ui';

function Protected({ roles }: { roles?: Array<'ADMIN' | 'EMPLOYEE'> }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'EMPLOYEE' ? '/attendance' : '/'} replace />;
  }
  return <Outlet />;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') return <Navigate to="/attendance" replace />;
  return <DashboardPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Protected />}>
            <Route element={<AppLayout />}>
              <Route index element={<HomeRedirect />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="payroll" element={<PayrollPage />} />
              <Route element={<Protected roles={['ADMIN']} />}>
                <Route path="revenues" element={<RevenuesPage />} />
                <Route path="employees" element={<EmployeesPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit-logs" element={<AuditLogsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
