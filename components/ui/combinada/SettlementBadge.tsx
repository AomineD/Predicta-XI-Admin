import { cn } from '@/lib/utils';

export type SettlementStatus = 'won' | 'lost' | 'void' | 'pending' | 'partial' | string;

interface SettlementBadgeProps {
  status: SettlementStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const MAP: Record<string, { bg: string; fg: string; border: string }> = {
  won:     { bg: 'rgba(34,197,94,0.14)',  fg: '#4ADE80',   border: 'rgba(34,197,94,0.32)' },
  lost:    { bg: 'rgba(239,68,68,0.14)',  fg: '#F87171',   border: 'rgba(239,68,68,0.32)' },
  void:    { bg: 'rgba(255,255,255,0.06)',fg: '#98A2B3',   border: 'rgba(255,255,255,0.08)' },
  pending: { bg: 'rgba(245,158,11,0.14)', fg: '#FBBF24',   border: 'rgba(245,158,11,0.32)' },
  partial: { bg: 'rgba(245,158,11,0.14)', fg: '#FBBF24',   border: 'rgba(245,158,11,0.32)' },
};

export function SettlementBadge({ status, size = 'md', className }: SettlementBadgeProps) {
  const key = String(status ?? 'pending').toLowerCase();
  const s = MAP[key] ?? MAP.pending;
  const label = String(status ?? 'pending').toUpperCase();
  const isPending = key === 'pending';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-sans font-semibold uppercase tracking-wider whitespace-nowrap',
        size === 'sm' ? 'px-2 py-[3px] text-[10px]' : 'px-2.5 py-[5px] text-[11px]',
        className,
      )}
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
    >
      <span
        className="inline-block shrink-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: s.fg,
          boxShadow: isPending ? `0 0 0 3px ${s.bg}` : 'none',
        }}
      />
      {label}
    </span>
  );
}
