'use client';

import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  value: string;
  onChange: (id: string) => void;
  items: TabItem[];
  className?: string;
}

export function Tabs({ value, onChange, items, className }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'flex items-center gap-1 mb-4 overflow-x-auto no-scrollbar rounded-2xl p-1',
        className,
      )}
      style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`tabpanel-${item.id}`}
            id={`tab-${item.id}`}
            onClick={() => onChange(item.id)}
            className={cn(
              'whitespace-nowrap px-4 h-9 rounded-xl text-xs font-sans font-medium transition-colors',
              active
                ? 'bg-surface-3 text-text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-3/50',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
