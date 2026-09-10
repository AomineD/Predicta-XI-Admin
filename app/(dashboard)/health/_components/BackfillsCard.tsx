'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { Toggle, NumInput } from '@/components/ui/form-controls';
import { useToast } from '@/components/ui/ToastProvider';
import { cn, formatDateTime } from '@/lib/utils';

type ParamSpec =
  | { key: string; type: 'number'; label: string; help?: string; default: number; min: number; max: number }
  | { key: string; type: 'boolean'; label: string; help?: string; default: boolean };

interface BackfillRun {
  id: string;
  backfillId: string;
  mode: 'dry_run' | 'execute';
  status: 'running' | 'completed' | 'failed';
  params: Record<string, number | boolean>;
  report: (Record<string, unknown> & { summary?: string }) | null;
  log: string | null;
  error: string | null;
  actor: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface BackfillItem {
  definition: {
    id: string;
    title: string;
    description: string;
    addedAt: string;
    repeatable?: boolean;
    usesNetwork?: boolean;
    params: ParamSpec[];
  };
  lastRun: BackfillRun | null;
  lastExecute: BackfillRun | null;
  isRunning: boolean;
  canExecute: boolean;
  blockedReason: string | null;
}

const STATUS_TONE: Record<BackfillRun['status'], string> = {
  running: 'bg-warning/15 text-warning',
  completed: 'bg-success/15 text-success',
  failed: 'bg-danger/15 text-danger',
};

const STATUS_LABEL: Record<BackfillRun['status'], string> = {
  running: 'En curso',
  completed: 'Terminado',
  failed: 'Falló',
};

/**
 * Backfills: reparaciones puntuales de datos, lanzables desde el panel.
 *
 * Antes vivían solo como scripts en `backend-code/scripts/`, que exigen un
 * `npx tsx` contra la base de producción y no dejan rastro de qué se corrió. El
 * catálogo lo rellena Claude en `admin/backfills/registry.ts` y aquí se opera:
 * primero **Simular**, que no escribe nada, y solo después **Ejecutar**.
 *
 * Cada backfill se ejecuta de verdad **una sola vez** (salvo los marcados como
 * repetibles): son arreglos de un incidente concreto, y el bloqueo lo hace
 * cumplir un índice único en la base, no esta pantalla.
 */
export function BackfillsCard() {
  const { data, isLoading, error } = useQuery<{ items: BackfillItem[] }>({
    queryKey: ['backfills'],
    queryFn: () => api.get('/admin/backfills'),
    // Mientras algo corre se refresca solo; en reposo no se toca la red.
    refetchInterval: (query) =>
      query.state.data?.items.some((i) => i.isRunning) ? 3_000 : false,
  });

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-4">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider font-sans">
            Backfills
          </h2>
          <InfoPopover label="Qué son los backfills">
            Reparaciones puntuales de datos ya guardados: recuperar estadísticas que no llegaron,
            re-liquidar picks que se anularon sin datos, rellenar una columna nueva. <strong>Simular</strong>{' '}
            hace todas las cuentas y no escribe nada — úsalo siempre primero y revisa la traza.{' '}
            <strong>Ejecutar</strong> escribe de verdad y, salvo los marcados como repetibles, solo se
            puede hacer <strong>una vez</strong>: el bloqueo está en la base de datos, así que ni un
            doble clic ni dos pestañas pueden colar una segunda pasada. Un intento fallido sí se puede
            reintentar.
          </InfoPopover>
        </div>
        <p className="text-xs text-text-muted mt-0.5">
          Arreglos de datos puntuales. Simula antes de ejecutar.
        </p>
      </div>

      {isLoading && <p className="text-sm text-text-muted">Cargando…</p>}
      {error && <p className="text-sm text-danger">{(error as Error).message}</p>}
      {data?.items.length === 0 && (
        <p className="text-sm text-text-muted">No hay backfills en el catálogo ahora mismo.</p>
      )}

      <div className="space-y-3">
        {data?.items.map((item) => <BackfillRow key={item.definition.id} item={item} />)}
      </div>
    </div>
  );
}

function BackfillRow({ item }: { item: BackfillItem }) {
  const { definition: def } = item;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Los parámetros arrancan en sus defaults declarados. Se guardan por backfill y
  // no se persisten: un backfill se lanza una vez, no se configura.
  const [params, setParams] = useState<Record<string, number | boolean>>(() =>
    Object.fromEntries(def.params.map((p) => [p.key, p.default])),
  );

  const run = useMutation({
    mutationFn: (mode: 'dry_run' | 'execute') =>
      api.post<{ runId: string }>(`/admin/backfills/${def.id}/run`, { mode, params }),
    onSuccess: (_res, mode) => {
      toast.success(mode === 'dry_run' ? 'Simulación lanzada' : 'Backfill lanzado');
      setExpanded(true);
      setShowLog(true);
      void queryClient.invalidateQueries({ queryKey: ['backfills'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const stop = useMutation({
    mutationFn: (runId: string) => api.post(`/admin/backfills/runs/${runId}/stop`),
    onSuccess: () => {
      toast.success('Parada solicitada; terminará el elemento en curso.');
      void queryClient.invalidateQueries({ queryKey: ['backfills'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const last = item.lastRun;
  const busy = item.isRunning || run.isPending;

  const summary = useMemo(() => {
    if (!last) return 'Nunca se ha lanzado.';
    const who = last.mode === 'dry_run' ? 'Simulación' : 'Ejecución';
    if (last.status === 'running') return `${who} en curso desde ${formatDateTime(last.startedAt)}`;
    if (last.status === 'failed') return `${who} fallida: ${last.error ?? 'sin detalle'}`;
    return last.report?.summary ? String(last.report.summary) : `${who} terminada.`;
  }, [last]);

  return (
    <div className="rounded-xl p-4" style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-text-primary font-sans">{def.title}</h3>
            {last && (
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wide',
                  STATUS_TONE[last.status],
                )}
              >
                {STATUS_LABEL[last.status]}
                {last.mode === 'dry_run' && last.status !== 'running' ? ' · simulación' : ''}
              </span>
            )}
            {def.repeatable && (
              <span className="text-[11px] text-text-muted uppercase tracking-wide">repetible</span>
            )}
            {def.usesNetwork && (
              <span className="text-[11px] text-text-muted uppercase tracking-wide">usa la fuente externa</span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">{summary}</p>
        </div>

        <div className="flex items-center gap-2">
          {item.isRunning && last && (
            <Button size="sm" variant="ghost" onClick={() => stop.mutate(last.id)} disabled={stop.isPending}>
              Parar
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Ocultar' : 'Ver'}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-text-secondary leading-relaxed">{def.description}</p>
          <p className="text-[11px] text-text-muted mt-2">
            En el catálogo desde {def.addedAt} · id <code className="text-text-secondary">{def.id}</code>
          </p>

          {def.params.length > 0 && (
            <div className="mt-4">
              {def.params.map((spec) => (
                <div key={spec.key} className="flex items-start gap-4 py-2.5 border-b border-border last:border-0">
                  <div className="w-56 flex-none">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm text-text-muted font-sans">{spec.label}</span>
                      {spec.help && (
                        <InfoPopover label={`Qué hace "${spec.label}"`}>{spec.help}</InfoPopover>
                      )}
                    </span>
                    {spec.type === 'number' && (
                      <p className="text-xs text-text-muted/50 mt-0.5">
                        {spec.min}–{spec.max}
                      </p>
                    )}
                  </div>
                  <div className="flex-1">
                    {spec.type === 'boolean' ? (
                      <Toggle
                        value={params[spec.key] as boolean}
                        onChange={(v) => setParams((p) => ({ ...p, [spec.key]: v }))}
                        disabled={busy}
                      />
                    ) : (
                      <NumInput
                        value={params[spec.key] as number}
                        onChange={(v) => setParams((p) => ({ ...p, [spec.key]: v }))}
                        min={spec.min}
                        max={spec.max}
                        disabled={busy}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run.mutate('dry_run')}
              disabled={busy}
            >
              Simular
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConfirming(true)}
              disabled={busy || !item.canExecute}
            >
              Ejecutar
            </Button>
            {/* El motivo del bloqueo se queda VISIBLE, no detrás de un ⓘ: es la
                respuesta a "por qué no puedo darle al botón". */}
            {item.blockedReason && (
              <span className="text-xs text-text-muted">{item.blockedReason}</span>
            )}
            {item.lastExecute?.status === 'completed' && (
              <span className="text-xs text-text-muted">
                Ejecutado {formatDateTime(item.lastExecute.finishedAt ?? item.lastExecute.startedAt)}
                {item.lastExecute.actor ? ` · ${item.lastExecute.actor}` : ''}
              </span>
            )}
          </div>

          {last?.log && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                className="text-xs text-secondary hover:underline"
              >
                {showLog ? 'Ocultar traza' : 'Ver traza'} de la última{' '}
                {last.mode === 'dry_run' ? 'simulación' : 'ejecución'}
              </button>
              {showLog && (
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg p-3 text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap bg-surface-2 border border-border">
                  {last.log}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        variant="danger"
        title={`Ejecutar «${def.title}»`}
        confirmLabel="Ejecutar de verdad"
        cancelLabel="Cancelar"
        loading={run.isPending}
        message={
          <span className="text-sm text-text-secondary">
            Esto <strong>escribe en la base de datos</strong> y
            {def.repeatable ? ' se puede repetir.' : ' solo se puede hacer una vez: no hay deshacer.'}
            {def.usesNetwork && ' Sale a la fuente externa, así que puede tardar varios minutos.'}
            <br />
            <br />
            Si todavía no has mirado la traza de una simulación, cancela y dale a{' '}
            <strong>Simular</strong> primero.
          </span>
        }
        onConfirm={() => {
          setConfirming(false);
          run.mutate('execute');
        }}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
