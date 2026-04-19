'use client';

import { cn } from '@/lib/utils';

export type Lang = 'EN' | 'ES';

interface LangToggleProps {
  value: Lang;
  onChange: (value: Lang) => void;
  className?: string;
}

export function LangToggle({ value, onChange, className }: LangToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex p-[3px] rounded-full gap-[2px] bg-black/25 border border-[rgba(255,255,255,0.08)]',
        className,
      )}
    >
      {(['EN', 'ES'] as const).map((l) => {
        const active = value === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => onChange(l)}
            className={cn(
              'px-3 py-1 rounded-full border-none text-[11px] font-semibold tracking-wide cursor-pointer transition-colors',
              active ? 'bg-surface-3 text-text-primary' : 'bg-transparent text-text-muted hover:text-text-secondary',
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
