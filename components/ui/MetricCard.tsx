import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  accent?: boolean;
  className?: string;
}

export function MetricCard({ label, value, sub, accent, className }: MetricCardProps) {
  return (
    <div
      className={cn('rounded-2xl p-5 flex flex-col gap-2', className)}
      style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <span className="text-xs font-medium text-text-muted uppercase tracking-wider font-sans">{label}</span>
      <span
        className={cn('text-3xl font-bold font-sans leading-none', accent ? 'text-primary' : 'text-text-primary')}
      >
        {value ?? '—'}
      </span>
      {sub && <span className="text-xs text-text-muted font-sans">{sub}</span>}
    </div>
  );
}
