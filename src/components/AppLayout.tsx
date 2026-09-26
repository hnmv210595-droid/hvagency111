import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CalendarCheck2,
  Wallet,
  Banknote,
  FileBarChart2,
  ScrollText,
  Settings,
  MessageCircle,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

const adminNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/employees', label: 'Nhân viên', icon: Users },
  { to: '/attendance', label: 'Điểm danh', icon: CalendarCheck2 },
  { to: '/revenues', label: 'Doanh thu', icon: Wallet },
  { to: '/payroll', label: 'Bảng lương', icon: Banknote },
  { to: '/reports', label: 'Báo cáo', icon: FileBarChart2 },
  { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/telegram', label: 'Telegram', icon: MessageCircle },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
];

const employeeNav = [
  { to: '/attendance', label: 'Điểm danh', icon: CalendarCheck2 },
  { to: '/payroll', label: 'Lương của tôi', icon: Banknote },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('hv-theme') === 'dark');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('hv-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const nav = user?.role === 'ADMIN' ? adminNav : employeeNav;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[260px] border-r border-line/80 bg-white/95 p-4 backdrop-blur transition dark:bg-brand-950/95 dark:border-brand-800 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="mb-8 flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-xl font-semibold tracking-tight text-brand-700 dark:text-brand-300">
              HV-Agency
            </p>
            <p className="text-xs text-muted dark:text-brand-200">Internal</p>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || (user?.role === 'EMPLOYEE' && item.to === '/attendance')}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-muted hover:bg-brand-50 hover:text-ink dark:text-brand-200 dark:hover:bg-brand-900',
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-4 left-4 right-4 space-y-2">
          <div className="rounded-xl border border-line px-3 py-2 text-sm dark:border-brand-800">
            <p className="font-medium">{user?.username}</p>
            <p className="text-xs text-muted dark:text-brand-300">{user?.role}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              type="button"
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </aside>

      {open ? (
        <button
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          aria-label="Close overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line/70 bg-white/70 px-4 py-3 backdrop-blur dark:bg-brand-950/70 dark:border-brand-800 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <p className="font-semibold text-brand-700 dark:text-brand-300">HV-Agency Internal</p>
          <span className="w-5" />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
