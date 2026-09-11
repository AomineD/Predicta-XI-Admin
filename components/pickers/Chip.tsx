'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChipProps {
  label: string;
  avatarUrl?: string | null;
  onRemove: () => void;
  removeLabel: string;
  /** Referencia que ya no resuelve (p. ej. un id borrado). Se pinta atenuada, nunca se oculta: quitarla en silencio perdería la referencia sin que nadie lo note. */
  muted?: boolean;
  className?: string;
}

/** Chip de un elemento ya seleccionado (equipo, usuario…), con su baja. */
export function Chip({ label, avatarUrl, onRemove, removeLabel, muted, className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 pl-1.5 pr-1.5 py-1 rounded-lg text-xs font-sans max-w-full',
        muted ? 'bg-surface-3/60 text-text-muted' : 'bg-surface-3 text-text-primary',
        className,
      )}
    >
      {avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="w-4 h-4 rounded-sm object-contain flex-none" />
      )}
      <span className="truncate max-w-[14rem]">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="flex-none text-text-muted hover:text-danger transition-colors cursor-pointer"
      >
        <X size={12} />
      </button>
    </span>
  );
}
