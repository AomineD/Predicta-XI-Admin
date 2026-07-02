import { cn } from '@/lib/utils';

/** Placeholder de carga con pulso. Componer varios para imitar el layout real. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-3/60', className)} />;
}
