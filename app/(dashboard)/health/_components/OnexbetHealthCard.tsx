'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { MetricCard } from '@/components/ui/MetricCard';
import { cn, formatDateTime } from '@/lib/utils';

interface OnexbetHealth {
  envEnabled: boolean;
  enabled: boolean;
  influencePredictions: boolean;
  linkedLeagues: number;
  lastCaptureAt: string | null;
  matchesCaptured24h: number;
  needsReview: number;
  requests: {
    ok24h: number;
    errors24h: number;
    lastError: { at: string; message: string } | null;
    circuitOpenSince: string | null;
  } | null;
}

function hoursAgo(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return '< 1 h';
  return hours < 48 ? `${Math.floor(hours)} h` : `${Math.floor(hours / 24)} d`;
}

function modeLabel(h: OnexbetHealth): { text: string; tone: string } {
  if (!h.envEnabled) return { text: 'Sin ONEXBET_ENABLED', tone: 'text-text-muted' };
  if (!h.enabled || h.linkedLeagues === 0) return { text: 'Inerte', tone: 'text-text-muted' };
  if (!h.influencePredictions) return { text: 'Solo captura', tone: 'text-warning' };
  return { text: 'Rellenando cuotas', tone: 'text-success' };
}

/**
 * Salud de las cuotas de respaldo de 1xBet (plan motor-sesgos, fase 9). Los contadores
 * de peticiones vienen de Redis porque el cliente corre en el Worker y este panel habla
 * con el Backend.
 */
export function OnexbetHealthCard() {
  const { data, isError } = useQuery<OnexbetHealth>({
    queryKey: ['onexbet-health'],
    queryFn: () => api.get('/admin/onexbet/health'),
    refetchInterval: 60_000,
  });

  const mode = data ? modeLabel(data) : null;
  const req = data?.requests;
  const errorRate = req && req.ok24h + req.errors24h > 0 ? req.errors24h / (req.ok24h + req.errors24h) : null;

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-sans">Cuotas de respaldo (1xBet)</h2>
        <InfoPopover label="Qué mide esta tarjeta">
          Solo rellena lo que Sportium y Flashscore no traen. «Encendido» no significa «capturando»: mira la última captura y los
          errores. Se configura en Config → Automations → Cuotas de respaldo (1xBet).
        </InfoPopover>
        {mode && <span className={cn('ml-auto text-xs font-sans', mode.tone)}>{mode.text}</span>}
      </div>
      {isError ? (
        <p className="text-sm text-danger font-sans">No se pudo leer la salud de 1xBet.</p>
      ) : !data ? (
        <p className="text-sm text-text-muted font-sans">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Última captura"
              value={data.lastCaptureAt ? hoursAgo(data.lastCaptureAt) : 'Nunca'}
              sub={`${data.lastCaptureAt ? `${formatDateTime(data.lastCaptureAt)} · ` : ''}${data.linkedLeagues} liga(s) enlazada(s)`}
            />
            <MetricCard label="Partidos capturados 24 h" value={String(data.matchesCaptured24h)} />
            <MetricCard
              label="Errores 24 h"
              value={req ? String(req.errors24h) : '—'}
              sub={errorRate !== null ? `${(errorRate * 100).toFixed(1)} % de ${req!.ok24h + req!.errors24h} peticiones` : undefined}
            />
            <MetricCard label="En revisión" value={String(data.needsReview)} sub="Config → Automations" />
          </div>
          {req?.circuitOpenSince && (
            <p className="text-sm text-warning font-sans mt-3">
              Feed en pausa desde {formatDateTime(req.circuitOpenSince)} (3 fallos seguidos; se reintenta a los 10 min).
            </p>
          )}
          {req?.lastError && (
            <p className="text-xs text-text-muted font-sans mt-2 truncate">
              Último error ({formatDateTime(req.lastError.at)}): {req.lastError.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
