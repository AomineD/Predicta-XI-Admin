import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 px-6 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/15 text-danger">
        <AlertTriangle size={22} />
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary font-sans">{title}</p>
        {message && <p className="mt-1 max-w-sm break-words text-xs text-text-muted font-sans">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
