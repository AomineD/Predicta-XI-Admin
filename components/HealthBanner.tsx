'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AlertTriangle } from 'lucide-react';

interface HealthAlert {
  level: 'error' | 'warn';
  message: string;
}
interface HealthOverviewAlerts {
  alerts: HealthAlert[];
}

/**
 * Critical-state banner shown on the Dashboard. Reads the same
 * `/admin/health/overview` payload as the Health page (React Query dedupes the
 * fetch) and renders only when the server reports one or more alerts. Red when
 * any alert is an error, amber when only warnings. Renders nothing when healthy.
 */
export function HealthBanner() {
  const { data } = useQuery<HealthOverviewAlerts>({
    queryKey: ['health-overview'],
    queryFn: () => api.get('/admin/health/overview'),
    refetchInterval: 60_000,
  });

  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;

  const hasError = alerts.some((a) => a.level === 'error');
  const tone = hasError
    ? 'bg-danger/10 border-danger/40 text-danger'
    : 'bg-warning/10 border-warning/40 text-warning';

  return (
    <Link
      href="/health"
      className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors hover:bg-surface-2 ${tone}`}
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold">
          {hasError ? 'Hay un problema crítico en el sistema' : 'Atención: revisa el estado del sistema'}
        </p>
        <ul className="mt-1 space-y-0.5">
          {alerts.map((a) => (
            <li key={a.message} className="text-xs text-text-secondary">
              • {a.message}
            </li>
          ))}
        </ul>
      </div>
      <span className="self-center text-xs text-text-muted">Ver Health →</span>
    </Link>
  );
}
