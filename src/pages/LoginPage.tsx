import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button, Card, Input, Label } from '@/components/ui';
import { useToast } from '@/components/toast';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
      toast.push('Đăng nhập thành công', 'success');
      navigate('/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Đăng nhập thất bại';
      toast.push(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(120deg, rgba(41,102,86,.15), transparent 40%), radial-gradient(circle at 80% 20%, rgba(53,127,107,.2), transparent 35%)',
        }}
      />
      <Card className="relative w-full max-w-md animate-[fadeIn_.4s_ease]">
        <div className="mb-6">
          <p className="font-display text-3xl font-semibold tracking-tight text-brand-700 dark:text-brand-300">
            HV-Agency
          </p>
          <p className="mt-1 text-sm text-muted dark:text-brand-200">
            Hệ thống quản lý nhân sự & lương nội bộ
          </p>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <Label>Tên đăng nhập</Label>
            <Input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Mật khẩu</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
        <p className="mt-4 text-xs text-muted dark:text-brand-300">
          Employee chỉ đăng nhập từ IP công ty. Session dùng cookie HttpOnly — không lưu token trên
          trình duyệt.
        </p>
      </Card>
    </div>
  );
}
