'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard, Field, Toggle, NumInput } from '@/components/ui/form-controls';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/ToastProvider';
import type { PlayerRatingsConfig, PlayerRatingsCoverageRow } from './types';

/**
 * Notas de los jugadores (idea #33) — tabla propia `player_ratings_config` con
 * GET/PUT propios, igual que Sportium y la fuente secundaria. Vive junto a ellas
 * porque comparte el mismo patrón de DOBLE LLAVE: `enabled` captura el dato y lo
 * enseña en la app; `influencePredictions` decide, aparte, si además toca al
 * modelo.
 *
 * La tabla de cobertura por liga de abajo es el diagnóstico que importa: si TODAS
 * las ligas voltean a "sin notas" el mismo día, no es que dejaran de publicarlas
 * — es que el scraper dejó de verlas.
 */
export function PlayerRatingsCard() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: cfg } = useQuery<{ config: Record<string, unknown> | null }>({
    queryKey: ['player-ratings-config'],
    queryFn: () => api.get('/admin/player-ratings/config'),
  });

  const [form, setForm] = useState<PlayerRatingsConfig | null>(null);
  const initial = useMemo<PlayerRatingsConfig | null>(() => {
    const c = cfg?.config as Record<string, unknown> | null | undefined;
    if (!c) return null;
    const n = (key: string, fallback: number): number => {
      // Las columnas `numeric` llegan como string desde la API.
      const raw = c[key];
      const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
      enabled: (c.enabled as boolean) ?? false,
      influencePredictions: (c.influencePredictions as boolean) ?? false,
      captureDelayMinutes: n('captureDelayMinutes', 15),
      retryMinutes: n('retryMinutes', 20),
      maxAttempts: n('maxAttempts', 4),
      noRatingsMaxAttempts: n('noRatingsMaxAttempts', 3),
      maxMatchAgeHours: n('maxMatchAgeHours', 72),
      competitionNoRatingsStreak: n('competitionNoRatingsStreak', 10),
      minAppearances: n('minAppearances', 3),
      goodThreshold: n('goodThreshold', 7),
      greatThreshold: n('greatThreshold', 8),
      momentumWindowMatches: n('momentumWindowMatches', 5),
      momentumHalfLifeMatches: n('momentumHalfLifeMatches', 2),
      momentumMinMatches: n('momentumMinMatches', 3),
      momentumTrendThreshold: n('momentumTrendThreshold', 0.15),
    };
  }, [cfg]);
  const pr = form ?? initial;

  const save = useMutation({
    mutationFn: (body: PlayerRatingsConfig) => api.put('/admin/player-ratings/config', body),
    onSuccess: () => {
      setForm(null);
      toast.success('Notas de jugadores guardadas.');
      qc.invalidateQueries({ queryKey: ['player-ratings-config'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: queueData, refetch: refetchQueue, isFetching: queueLoading } = useQuery<{
    stats: { queuedJobs: number; dueJobs: number; runningJobs: number };
    coverage: PlayerRatingsCoverageRow[];
  }>({
    queryKey: ['player-ratings-queue'],
    queryFn: () => api.get('/admin/player-ratings/queue'),
    enabled: false,
  });

  const [probeMatchId, setProbeMatchId] = useState('');
  const probe = useMutation({
    mutationFn: (matchId: number) => api.post('/admin/player-ratings/probe', { matchId }),
    onSuccess: () => {
      toast.success('Partido encolado para capturar sus notas.');
      setProbeMatchId('');
      void refetchQueue();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const columns: Column<PlayerRatingsCoverageRow>[] = [
    {
      key: 'competition',
      header: 'Liga',
      render: (r) => (
        <span className="text-text-primary">{r.competitionName ?? `#${r.competitionId ?? '—'}`}</span>
      ),
    },
    { key: 'completed', header: 'Con notas', render: (r) => <span className="text-success">{r.completed}</span> },
    { key: 'noRatings', header: 'Sin notas', render: (r) => <span className="text-text-muted/70">{r.noRatings}</span> },
    { key: 'failed', header: 'Fallidos', render: (r) => <span className={r.failed > 0 ? 'text-danger' : 'text-text-muted/40'}>{r.failed}</span> },
    {
      key: 'last',
      header: 'Última captura',
      render: (r) => (
        <span className="text-xs text-text-muted/70">
          {r.lastCapturedAt ? new Date(r.lastCapturedAt).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) =>
        r.unsupported ? (
          <span className="text-warning text-xs">Sin soporte</span>
        ) : (
          <span className="text-success text-xs">Activa</span>
        ),
    },
  ];

  const invalidThresholds = !!pr && pr.goodThreshold >= pr.greatThreshold;

  return (
    <SectionCard
      title="Notas de los jugadores"
      subtitle="Nace inerte"
      info="Captura la calificación individual de cada jugador unos minutos después del final del partido. Alimenta tres pantallas de la app (plantilla del equipo, alineación del partido terminado y perfil del jugador) y, aparte, el momento del equipo que puede entrar al contexto del modelo."
    >
      {!pr ? (
        <p className="text-text-muted text-sm font-sans py-3">Cargando…</p>
      ) : (
        <>
          <Field
            label="Notas habilitadas"
            info="Interruptor maestro. Apagado = no se captura nada y la app no muestra ninguna de las tres pantallas. Encendido = se capturan y se ven."
          >
            <Toggle value={pr.enabled} onChange={(v) => setForm({ ...pr, enabled: v })} />
          </Field>
          <Field
            label="Influir en predicciones"
            info="Aparte del maestro. Apagado: el momento del equipo se ve en la app pero NO se envía al modelo. Encendido: además entra al contexto de predicción. Requiere también marcar el campo en la configuración de predicción."
          >
            <Toggle
              value={pr.influencePredictions}
              onChange={(v) => setForm({ ...pr, influencePredictions: v })}
              disabled={!pr.enabled}
            />
          </Field>

          <Field label="Retraso de captura (min)" subtitle="5–120 · def. 15" info="Minutos tras el final del partido antes del primer intento. La fuente publica las notas unos minutos después del pitido.">
            <NumInput value={pr.captureDelayMinutes} onChange={(v) => setForm({ ...pr, captureDelayMinutes: v })} min={5} max={120} />
          </Field>
          <Field label="Reintento (min)" subtitle="5–60 · def. 20" info="Espera entre intentos cuando la captura falla o las notas aún no están publicadas.">
            <NumInput value={pr.retryMinutes} onChange={(v) => setForm({ ...pr, retryMinutes: v })} min={5} max={60} />
          </Field>
          <Field label="Intentos ante error" subtitle="1–10 · def. 4" info="Cuántas veces se reintenta un fallo de captura antes de darlo por perdido.">
            <NumInput value={pr.maxAttempts} onChange={(v) => setForm({ ...pr, maxAttempts: v })} min={1} max={10} />
          </Field>
          <Field label="Intentos sin notas" subtitle="1–5 · def. 3" info="Cuántas veces se vuelve a mirar un partido cuya página cargó bien pero no traía notas, antes de darlo por 'sin notas'. Ese estado es definitivo y no se reintenta.">
            <NumInput value={pr.noRatingsMaxAttempts} onChange={(v) => setForm({ ...pr, noRatingsMaxAttempts: v })} min={1} max={5} />
          </Field>
          <Field label="Antigüedad máxima (h)" subtitle="6–720 · def. 72" info="No se encolan partidos que terminaron hace más de esto: la fuente deja de publicar sus alineaciones y sería quemar capturas.">
            <NumInput value={pr.maxMatchAgeHours} onChange={(v) => setForm({ ...pr, maxMatchAgeHours: v })} min={6} max={720} />
          </Field>
          <Field label="Racha para descartar una liga" subtitle="3–50 · def. 10" info="Partidos seguidos sin notas en una misma liga antes de dejar de intentarlo ahí. Hay ligas donde la fuente nunca publica notas; sin este corte se quemaría una captura por partido para siempre.">
            <NumInput value={pr.competitionNoRatingsStreak} onChange={(v) => setForm({ ...pr, competitionNoRatingsStreak: v })} min={3} max={50} />
          </Field>

          <Field label="Partidos mínimos para mostrar la media" subtitle="1–20 · def. 3" info="Por debajo de esto la app pinta un guion en vez de una nota. Evita que un solo partido produzca una media engañosa.">
            <NumInput value={pr.minAppearances} onChange={(v) => setForm({ ...pr, minAppearances: v })} min={1} max={20} />
          </Field>
          <Field label="Corte de nota buena" subtitle="1–10 · def. 7.0" info="Desde esta nota el chip se pinta en verde suave.">
            <NumInput value={pr.goodThreshold} onChange={(v) => setForm({ ...pr, goodThreshold: v })} min={1} max={10} step={0.1} />
          </Field>
          <Field label="Corte de nota notable" subtitle="1–10 · def. 8.0" info="Desde esta nota el chip se destaca. Debe ser mayor que el corte de nota buena.">
            <NumInput value={pr.greatThreshold} onChange={(v) => setForm({ ...pr, greatThreshold: v })} min={1} max={10} step={0.1} />
          </Field>

          <Field label="Momento: partidos de la ventana" subtitle="3–15 · def. 5" info="Cuántos partidos recientes entran en el cálculo del momento del equipo.">
            <NumInput value={pr.momentumWindowMatches} onChange={(v) => setForm({ ...pr, momentumWindowMatches: v })} min={3} max={15} />
          </Field>
          <Field label="Momento: semivida (partidos)" subtitle="0.5–10 · def. 2.0" info="Con 2, lo de hace dos jornadas pesa la mitad que lo último. Más bajo = más reactivo a los últimos partidos.">
            <NumInput value={pr.momentumHalfLifeMatches} onChange={(v) => setForm({ ...pr, momentumHalfLifeMatches: v })} min={0.5} max={10} step={0.5} />
          </Field>
          <Field label="Momento: partidos mínimos" subtitle="1–10 · def. 3" info="Por debajo de esto no se publica momento: no hay muestra suficiente.">
            <NumInput value={pr.momentumMinMatches} onChange={(v) => setForm({ ...pr, momentumMinMatches: v })} min={1} max={10} />
          </Field>
          <Field label="Momento: umbral de tendencia" subtitle="0–2 · def. 0.15" info="Diferencia mínima contra la media simple para declarar que el equipo está en alza o a la baja. Por debajo, se muestra estable.">
            <NumInput value={pr.momentumTrendThreshold} onChange={(v) => setForm({ ...pr, momentumTrendThreshold: v })} min={0} max={2} step={0.05} />
          </Field>

          <div className="flex items-center gap-3 pt-3">
            <Button variant="primary" loading={save.isPending} disabled={invalidThresholds} onClick={() => save.mutate(pr)}>
              Guardar
            </Button>
            {invalidThresholds && (
              <span className="text-xs font-sans text-danger">El corte de nota buena debe ser menor que el de notable.</span>
            )}
            {!invalidThresholds && pr.enabled && !pr.influencePredictions && (
              <span className="text-xs font-sans text-warning">Visible en la app; todavía no influye en las predicciones.</span>
            )}
            {!invalidThresholds && pr.enabled && pr.influencePredictions && (
              <span className="text-xs font-sans text-success">Visible en la app e influyendo en las predicciones.</span>
            )}
          </div>

          <div className="pt-6">
            <div className="flex items-center justify-between gap-3 pb-2">
              <div className="flex items-center gap-1.5">
                <p className="text-sm text-text-primary font-sans">Cobertura por liga</p>
                <InfoPopover label="Cómo leer la cobertura">
                  Cuántos partidos de cada liga llegaron con notas y cuántos no. Una liga marcada &quot;Sin soporte&quot;
                  agotó la racha y ya no se intenta. <b>Si TODAS las ligas voltean a &quot;Sin notas&quot; el mismo
                  día</b>, no es que la fuente dejara de publicarlas: es que el scraper dejó de verlas y hay que revisar
                  el selector.
                </InfoPopover>
              </div>
              <Button variant="secondary" loading={queueLoading} onClick={() => void refetchQueue()}>
                Cargar cobertura
              </Button>
            </div>
            {queueData ? (
              <>
                <p className="text-xs font-sans text-text-muted/70 pb-2">
                  En cola: {queueData.stats.queuedJobs} · vencidos: {queueData.stats.dueJobs} · corriendo:{' '}
                  {queueData.stats.runningJobs}
                </p>
                <DataTable
                  columns={columns}
                  data={queueData.coverage}
                  keyExtractor={(r) => String(r.competitionId ?? 'none')}
                />
              </>
            ) : (
              <p className="text-text-muted text-sm font-sans py-2">Pulsa &quot;Cargar cobertura&quot; para verla.</p>
            )}

            <div className="flex items-end gap-3 pt-4">
              <Field
                label="Probar un partido"
                subtitle="ID interno del partido"
                info="Encola la captura saltándose el corte por liga y el 'ya resuelto'. Es la vía de recuperación cuando una liga se marcó por error o después de arreglar el scraper."
              >
                <Input
                  className="w-32"
                  value={probeMatchId}
                  onChange={(e) => setProbeMatchId(e.target.value)}
                  placeholder="17299"
                />
              </Field>
              <Button
                variant="secondary"
                loading={probe.isPending}
                disabled={!Number.isFinite(Number(probeMatchId)) || Number(probeMatchId) <= 0}
                onClick={() => probe.mutate(Number(probeMatchId))}
              >
                Probar partido
              </Button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
