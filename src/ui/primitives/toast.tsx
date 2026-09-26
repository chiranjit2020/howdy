'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../cn';
import { CloseIcon } from '../icons';
import { IconButton } from './icon-button';

export type ToastTone = 'info' | 'success' | 'danger';
export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const MAX_VISIBLE = 3;
const DURATION_MS: Record<ToastTone, number> = { info: 5000, success: 5000, danger: 8000 };
const TONE_BAR: Record<ToastTone, string> = { info: 'bg-info', success: 'bg-success', danger: 'bg-danger' };

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const tone = toast.tone ?? 'info';
  const [paused, setPaused] = useState(false);

  // Auto-dismiss, paused while hovered/focused so it can be read and reached (WCAG 2.2.1).
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onDismiss(toast.id), DURATION_MS[tone]);
    return () => clearTimeout(t);
  }, [paused, tone, toast.id, onDismiss]);

  return (
    <div
      // Errors interrupt (alert); everything else is polite (status).
      role={tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex animate-toast-in overflow-hidden rounded-lg bg-surface-raised shadow-float"
    >
      <span aria-hidden="true" className={cn('w-2 shrink-0', TONE_BAR[tone])} />
      <div className="flex-1 py-3 pl-3">
        <p className="text-caption font-semibold text-text-primary">{toast.title}</p>
        {toast.description && <p className="text-caption text-text-secondary">{toast.description}</p>}
      </div>
      <IconButton label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <CloseIcon />
      </IconButton>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback((input: ToastInput) => {
    setToasts((all) => [...all, { ...input, id: nextId.current++ }].slice(-MAX_VISIBLE));
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-[min(92vw,26rem)] flex-col gap-2 md:bottom-6">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
