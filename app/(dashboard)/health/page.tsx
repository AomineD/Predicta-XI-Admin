'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { cn, formatDateTime } from '@/lib/utils';

interface ServiceCheck {
  status: string;
  latencyMs: number;
  error?: string;
}
interface HealthOverview {
  status: 'healthy' | 'degraded' | 'unhealthy';
  generatedAt: string;
  core: {
    postgres: ServiceCheck;
    redis: ServiceCheck;
    memory: { rssmb: number; heapUsedMb: number; heapTotalMb: number };
    uptimeSeconds: number;
    version: string;
  };
  automation: {
    automationEnabled: boolean;
    matchSyncEnabled: boolean;
    resultSyncEnabled: boolean;
    enrichmentSyncEnabled: boolean;
    teamRefreshEnabled: boolean;
    activeModel: string | null;
  };
  predictions: { upcomingWithoutPrediction: number; windowHours: number };
  llm: {
    activeModel: string | null;
    keys: Array<{ provider: string; active: boolean; testStatus: string | null; lastTestedAt: string | null }>;
  };
  integrations: Array<{ key: string; label: string; status: 'ok' | 'not_configured'; detail: string }>;
  alerts: Array<{ level: 'error' | 'warn'; message: string }>;
}

const TONE: Record<string, string> = {
  ok: 'bg-success/15 text-success',
  connected: 'bg-success/15 text-success',
  healthy: 'bg-success/15 text-success',
  degraded: 'bg-warning/15 text-warning',
  warn: 'bg-warning/15 text-warning',
  disconnected: 'bg-warning/15 text-warning',
  not_configured: 'bg-text-muted/15 text-text-muted',
  error: 'bg-danger/15 text-danger',
  unhealthy: 'bg-danger/15 text-danger',
};

function Pill({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans uppercase tracking-wide',
        TONE[status] ?? 'bg-text-muted/15 text-text-muted',
      )}
    >
      {label ?? status}
    </span>
  );
}

function FlagPill({ on, label }: { on: boolean; label: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-3 py-2"
      style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <span className="text-sm text-text-secondary">{label}</span>
      <Pill status={on ? 'ok' : 'not_configured'} label={on ? 'ON' : 'OFF'} />
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-sans">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function HealthPage() {
  const { data, isLoading, refetch, isFetching } = useQuery<HealthOverview>({
    queryKey: ['health-overview'],
    queryFn: () => api.get('/admin/health/overview'),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader
        title="Health"
        description="Estado de servicios e integraciones (solo lectura)"
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            className="px-3 py-2 rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            {isFetching ? 'Actualizando…' : 'Refrescar'}
          </button>
        }
      />

      {isLoading && <p className="text-sm text-text-muted">Cargando…</p>}

      {data && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm text-text-secondary">Estado general:</span>
            <Pill status={data.status} />
            <span className="text-xs text-text-muted ml-auto">Actualizado {formatDateTime(data.generatedAt)}</span>
          </div>

          {data.alerts.length > 0 && (
            <div className="rounded-2xl px-4 py-3 mb-6 bg-warning/10 border border-warning/40">
              <ul className="space-y-1">
                {data.alerts.map((a) => (
                  <li key={a.message} className={cn('text-sm', a.level === 'error' ? 'text-danger' : 'text-warning')}>
                    • {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Section title="Core" subtitle="Infraestructura propia (Dokploy)">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl p-4" style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-muted uppercase tracking-wider">PostgreSQL</span>
                  <Pill status={data.core.postgres.status} />
                </div>
                <span className="text-sm text-text-secondary">{data.core.postgres.latencyMs} ms</span>
              </div>
              <div className="rounded-xl p-4" style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-muted uppercase tracking-wider">Redis</span>
                  <Pill status={data.core.redis.status} />
                </div>
                <span className="text-sm text-text-secondary">{data.core.redis.latencyMs} ms</span>
              </div>
              <MetricCard label="Uptime" value={formatUptime(data.core.uptimeSeconds)} sub={`v${data.core.version}`} />
              <MetricCard
                label="Memoria"
                value={`${data.core.memory.rssmb} MB`}
                sub={`heap ${data.core.memory.heapUsedMb}/${data.core.memory.heapTotalMb} MB`}
              />
            </div>
          </Section>

          <Section
            title="Automatización"
            subtitle="Flags del scheduler. automation (interno) en OFF es intencional: el bridge de Claude dispara las predicciones."
          >
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <FlagPill on={data.automation.automationEnabled} label="Automation (interno)" />
              <FlagPill on={data.automation.matchSyncEnabled} label="Match sync" />
              <FlagPill on={data.automation.resultSyncEnabled} label="Result sync" />
              <FlagPill on={data.automation.enrichmentSyncEnabled} label="Enrichment sync" />
              <FlagPill on={data.automation.teamRefreshEnabled} label="Team refresh" />
              <div
                className="flex items-center justify-between rounded-xl px-3 py-2"
                style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-sm text-text-secondary">Modelo activo</span>
                <span className="text-xs font-mono text-text-primary">{data.automation.activeModel ?? '—'}</span>
              </div>
            </div>
          </Section>

          <Section title="Predicciones" subtitle={`Partidos próximos (${data.predictions.windowHours}h) sin predicción`}>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'text-3xl font-bold font-sans',
                  data.predictions.upcomingWithoutPrediction > 0 ? 'text-warning' : 'text-success',
                )}
              >
                {data.predictions.upcomingWithoutPrediction}
              </span>
              <span className="text-sm text-text-muted">
                {data.predictions.upcomingWithoutPrediction > 0 ? 'sin predicción en la ventana' : 'todo cubierto'}
              </span>
            </div>
          </Section>

          <Section title="LLM" subtitle={`Modelo activo: ${data.llm.activeModel ?? '—'}`}>
            {data.llm.keys.length === 0 ? (
              <p className="text-sm text-text-muted">Sin API keys configuradas.</p>
            ) : (
              <div className="space-y-2">
                {data.llm.keys.map((k) => (
                  <div
                    key={k.provider}
                    className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-sm text-text-primary font-medium flex-1">{k.provider}</span>
                    {!k.active && <Pill status="not_configured" label="inactiva" />}
                    <Pill
                      status={k.testStatus === 'success' ? 'ok' : k.testStatus === 'failed' ? 'error' : 'not_configured'}
                      label={k.testStatus ?? 'sin probar'}
                    />
                    <span className="text-xs text-text-muted w-36 text-right">
                      {k.lastTestedAt ? formatDateTime(k.lastTestedAt) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Integraciones externas" subtitle="Presencia de configuración (no se exponen secretos)">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {data.integrations.map((it) => (
                <div
                  key={it.key}
                  className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex-1">
                    <span className="text-sm text-text-primary font-medium">{it.label}</span>
                    {it.detail && <span className="text-xs text-text-muted ml-2">{it.detail}</span>}
                  </div>
                  <Pill status={it.status} label={it.status === 'ok' ? 'configurado' : 'sin configurar'} />
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
