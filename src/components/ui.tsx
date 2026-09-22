import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-11 px-5 text-base',
        variant === 'primary' &&
          'bg-brand-600 text-white hover:bg-brand-700 shadow-sm dark:bg-brand-500 dark:hover:bg-brand-400',
        variant === 'secondary' &&
          'bg-white text-ink border border-line hover:bg-brand-50 dark:bg-brand-900/40 dark:text-brand-50 dark:border-brand-700',
        variant === 'ghost' && 'hover:bg-brand-50 text-ink dark:hover:bg-brand-900/50 dark:text-brand-50',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:bg-brand-950/40 dark:border-brand-700 dark:text-brand-50',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand-500 dark:bg-brand-950/40 dark:border-brand-700 dark:text-brand-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label className={cn('mb-1.5 block text-sm font-medium text-muted dark:text-brand-200', className)}>
      {children}
    </label>
  );
}

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-line/80 bg-white/80 p-5 shadow-sm backdrop-blur dark:bg-brand-950/40 dark:border-brand-800',
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : <div />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted dark:text-brand-200">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-slate-100 text-slate-700 dark:bg-brand-900 dark:text-brand-100',
        tone === 'success' && 'bg-emerald-50 text-success dark:bg-emerald-950 dark:text-emerald-300',
        tone === 'warning' && 'bg-amber-50 text-warning dark:bg-amber-950 dark:text-amber-300',
        tone === 'danger' && 'bg-red-50 text-danger dark:bg-red-950 dark:text-red-300',
        tone === 'brand' && 'bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-200',
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-12 text-center dark:border-brand-800">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted dark:text-brand-200">{description}</p> : null}
    </div>
  );
}

export function LoadingState({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger dark:border-red-900 dark:bg-red-950/40">
      {message}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-white p-5 shadow-xl dark:bg-brand-950 dark:border-brand-800">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            Đóng
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line dark:border-brand-800">
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}
