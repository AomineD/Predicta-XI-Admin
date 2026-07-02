'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMounted } from '@/lib/use-mounted';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}

const SIZES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Modal compartido del panel: overlay a pantalla completa, cierre por Escape y
 * click en el backdrop, bloqueo de scroll del body. Antes cada modal reimplementaba
 * `fixed inset-0`; este unifica el patrón (referencia: CombinadaDetailModal).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  const mounted = useMounted();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ animation: 'overlayIn 0.15s ease-out' }}>
      <div className="absolute inset-0 bg-black/60" onClick={closeOnBackdrop ? onClose : undefined} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn('relative w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl', SIZES[size])}
        style={{ animation: 'modalIn 0.18s ease-out' }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-text-primary font-display">{title}</h2>}
            {description && <p className="text-sm text-text-muted font-sans mt-1 leading-snug">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
        {children != null && <div className="px-5 py-2">{children}</div>}
        {footer && <div className="flex items-center justify-end gap-2 px-5 pt-3 pb-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
