import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return createElement(
    ToastContext.Provider,
    { value },
    children,
    createElement(
      'div',
      {
        className:
          'pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(100%,22rem)] flex-col gap-2',
      },
      items.map((t) =>
        createElement(
          'div',
          {
            key: t.id,
            className: cn(
              'rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur',
              t.tone === 'success' &&
                'border-emerald-200 bg-emerald-50 text-success dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200',
              t.tone === 'error' &&
                'border-red-200 bg-red-50 text-danger dark:bg-red-950 dark:border-red-800 dark:text-red-200',
              t.tone === 'info' &&
                'border-line bg-white/95 text-ink dark:bg-brand-950 dark:border-brand-700 dark:text-brand-50',
            ),
          },
          t.message,
        ),
      ),
    ),
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
