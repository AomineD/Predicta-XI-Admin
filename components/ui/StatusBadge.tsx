import { cn } from '@/lib/utils';

type Settlement = 'won' | 'lost' | 'partial' | 'pending' | 'void';
type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'idle';

type Status = Settlement | JobStatus | string;

const STATUS_STYLES: Record<string, string> = {
  won:       'bg-success/15 text-success',
  lost:      'bg-danger/15 text-danger',
  partial:   'bg-warning/15 text-warning',
  pending:   'bg-warning/15 text-warning',
  void:      'bg-text-muted/15 text-text-muted',
  running:   'bg-warning/15 text-warning',
  completed: 'bg-success/15 text-success',
  failed:    'bg-danger/15 text-danger',
  cancelled: 'bg-amber-500/15 text-amber-400',
  idle:      'bg-text-muted/15 text-text-muted',
  active:    'bg-success/15 text-success',
  expired:   'bg-danger/15 text-danger',
  NS:        'bg-secondary/15 text-secondary',
  FT:        'bg-text-muted/15 text-text-muted',
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? 'bg-text-muted/15 text-text-muted';
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans uppercase tracking-wide w-fit',
        style,
        className,
      )}
    >
      {status}
    </span>
  );
}
