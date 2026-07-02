import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 px-6 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary font-sans">{title}</p>
        {description && <p className="mt-1 max-w-sm text-xs text-text-muted font-sans">{description}</p>}
      </div>
      {action}
    </div>
  );
}
