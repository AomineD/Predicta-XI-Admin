'use client';

import { AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastData {
  id: number;
  type: ToastType;
  message: string;
}

// El color del acento se aplica con la variable CSS del theme (Tactical Dark) en
// lugar de hex, para que el toast comparta la paleta con el resto del panel.
const CONFIG: Record<ToastType, { icon: LucideIcon; iconColor: string; cssVar: string }> = {
  success: { icon: CheckCircle2, iconColor: 'text-success', cssVar: 'var(--color-success)' },
  error: { icon: AlertTriangle, iconColor: 'text-danger', cssVar: 'var(--color-danger)' },
  info: { icon: Info, iconColor: 'text-secondary', cssVar: 'var(--color-secondary)' },
};

export function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
  const { icon: Icon, iconColor, cssVar } = CONFIG[toast.type];
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-2 px-4 py-3 shadow-lg"
      style={{ borderLeftWidth: 4, borderLeftColor: cssVar, animation: 'toastIn 0.18s ease-out' }}
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', iconColor)} />
      <p className="flex-1 text-sm text-text-primary font-sans leading-snug break-words">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
      >
        <X size={15} />
      </button>
    </div>
  );
}
