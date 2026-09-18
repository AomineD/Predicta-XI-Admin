'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard } from '@/components/ui/form-controls';
import { Select } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';
import { formatDateTime } from '@/lib/utils';

type OddsSource = 'sportium' | 'onexbet';

/** Fila de la cola, con los campos de las dos fuentes (cada una rellena los suyos). */
interface ReviewItem {
  matchId: number;
  matchConfidence: string | number;
  matchMethod?: string | null;
  createdAt: string | null;
  // Sportium
  sportiumEventName?: string | null;
  sportiumKickoff?: string | null;
  // 1xBet (trae además nuestro partido, para decidir sin abrir otra pantalla)
  onexbetEventName?: string | null;
  onexbetKickoff?: string | null;
  ourHome?: string | null;
  ourAway?: string | null;
  ourKickoff?: string | null;
}

const SOURCE_LABEL: Record<OddsSource, string> = { sportium: 'Sportium', onexbet: '1xBet' };

/**
 * Cola de revisión de casado de las casas de cuotas. Un partido que queda justo por
 * debajo del umbral de confianza no se enlaza solo (capturar las cuotas de OTRO partido
 * es el riesgo principal) y espera aquí: Enlazar lo confirma y se empieza a capturar;
 * Rechazar lo descarta y no se vuelve a proponer. Sportium tenía estas rutas sin
 * interfaz; la cola es la misma para las dos fuentes.
 */
export function OddsReviewQueue() {
  const qc = useQueryClient();
  const toast = useToast();
  const [source, setSource] = useState<OddsSource>('onexbet');
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);

  const { data, isLoading, isError } = useQuery<{ items: ReviewItem[] }>({
    queryKey: ['odds-review-queue', source],
    queryFn: () => api.get(`/admin/${source}/review-queue`),
  });

  const decide = useMutation({
    mutationFn: ({ matchId, action }: { matchId: number; action: 'link' | 'reject' }) =>
      api.post(`/admin/${source}/review/${matchId}/${action}`, {}),
    onSuccess: (_res, vars) => {
      toast.success(vars.action === 'link' ? 'Partido enlazado.' : 'Candidato rechazado.');
      setRejecting(null);
      qc.invalidateQueries({ queryKey: ['odds-review-queue', source] });
      qc.invalidateQueries({ queryKey: ['onexbet-health'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const items = data?.items ?? [];

  return (
    <SectionCard
      title="Cola de revisión de casado"
      info="Partidos cuyo casado con la casa de cuotas quedó justo por debajo de la confianza mínima. Compara nombres y hora antes de enlazar: si no son el mismo partido, recházalo. Rechazar es definitivo: ese candidato no se vuelve a proponer."
    >
      <div className="flex items-center gap-3 pb-3">
        <label htmlFor="odds-review-source" className="text-sm text-text-muted font-sans">
          Fuente
        </label>
        <Select
          id="odds-review-source"
          className="w-40"
          value={source}
          onChange={(e) => setSource(e.target.value as OddsSource)}
        >
          <option value="onexbet">{SOURCE_LABEL.onexbet}</option>
          <option value="sportium">{SOURCE_LABEL.sportium}</option>
        </Select>
      </div>
      {isLoading ? (
        <p className="text-text-muted text-sm font-sans py-2">Cargando…</p>
      ) : isError ? (
        <p className="text-danger text-sm font-sans py-2">
          No se pudo leer la cola de {SOURCE_LABEL[source]}: puede haber partidos esperando revisión.
        </p>
      ) : items.length === 0 ? (
        <p className="text-text-muted text-sm font-sans py-2">Nada pendiente de revisar en {SOURCE_LABEL[source]}.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const theirs = item.onexbetEventName ?? item.sportiumEventName ?? '—';
            const theirKickoff = item.onexbetKickoff ?? item.sportiumKickoff ?? null;
            const ours = item.ourHome && item.ourAway ? `${item.ourHome} - ${item.ourAway}` : `Partido #${item.matchId}`;
            const swapped = item.matchMethod === 'swapped';
            const busy = decide.isPending && decide.variables?.matchId === item.matchId;
            return (
              <div key={item.matchId} className="flex items-center gap-3 rounded-xl px-3 py-2 bg-surface-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-sans truncate">
                    {ours}
                    {item.ourKickoff && <span className="text-text-muted"> · {formatDateTime(item.ourKickoff)}</span>}
                  </p>
                  <p className="text-xs text-text-muted font-sans truncate">
                    {SOURCE_LABEL[source]}: {theirs}
                    {theirKickoff && ` · ${formatDateTime(theirKickoff)}`} · confianza {Number(item.matchConfidence).toFixed(3)}
                  </p>
                  {swapped && (
                    <p className="text-xs text-warning font-sans">
                      Local y visitante al revés: enlazarlo cruzaría las cuotas. Solo se puede rechazar.
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || swapped}
                  loading={busy && decide.variables?.action === 'link'}
                  onClick={() => decide.mutate({ matchId: item.matchId, action: 'link' })}
                >
                  Enlazar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  loading={busy && decide.variables?.action === 'reject'}
                  onClick={() => setRejecting(item)}
                >
                  Rechazar
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={rejecting !== null}
        variant="danger"
        title="Rechazar candidato"
        confirmLabel="Rechazar"
        cancelLabel="Cancelar"
        loading={decide.isPending}
        message={
          <span className="text-sm text-text-secondary">
            {rejecting?.onexbetEventName ?? rejecting?.sportiumEventName ?? 'Este candidato'} no se volverá a proponer para
            este partido, y el partido se quedará sin cuotas de {SOURCE_LABEL[source]}.
          </span>
        }
        onConfirm={() => rejecting && decide.mutate({ matchId: rejecting.matchId, action: 'reject' })}
        onClose={() => setRejecting(null)}
      />
    </SectionCard>
  );
}
