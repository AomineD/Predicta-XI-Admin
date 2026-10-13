'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/inputs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/ToastProvider';
import { cn, formatDateTime } from '@/lib/utils';
import {
  ENGINE_STUDY_QUERY_KEY,
  RATE_LIMIT_NOTICE,
  WEEKDAY_LABELS,
  aeTone,
  describeVerdict,
  fetchEngineStudy,
  fmtNum,
  isRateLimitError,
  runEngineStudy,
  triggerLabel,
  verdictLabel,
  verdictTone,
  type ClvAggregate,
  type EngineSelectionStat,
  type EngineStudyBandRow,
  type EngineStudyOverview,
  type EngineStudyRun,
  type WeeklyAeRow,
} from './_components/engine-study-api';
import { PerformanceBreakdownCard } from './_components/PerformanceBreakdownCard';
import { CombinadaPerformanceCard } from './_components/CombinadaPerformanceCard';

/** Color del movimiento de cuota: positivo = se acortó a favor del pick. */
function clvTone(pct: number | null | undefined): string {
  if (pct == null) return 'text-text-muted';
  if (pct > 0.25) return 'text-emerald-400';
  if (pct < -0.25) return 'text-rose-400';
  return 'text-text-primary';
}

function VerdictPill({ run }: { run: EngineStudyRun | null }) {
  if (!run) return <span className="text-text-muted">—</span>;
  const label = verdictLabel(run);
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans uppercase tracking-wide w-fit',
        verdictTone(run.verdict, run.status),
      )}
    >
      {label}
    </span>
  );
}

type ClvRow = { key: string; agg: ClvAggregate };

export default function EngineStudyPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, error, refetch } = useQuery<EngineStudyOverview>({
    queryKey: ENGINE_STUDY_QUERY_KEY,
    queryFn: fetchEngineStudy,
    staleTime: 30_000,
  });

  const runNow = useMutation({
    mutationFn: runEngineStudy,
    onSuccess: (run) => {
      toast.success(describeVerdict(run));
      qc.invalidateQueries({ queryKey: ENGINE_STUDY_QUERY_KEY });
    },
    onError: (err: Error) => {
      // El 429 es el límite de 2 corridas cada 5 minutos, no un fallo.
      if (isRateLimitError(err)) toast.info(RATE_LIMIT_NOTICE);
      else toast.error(err.message);
    },
  });

  const runButton = (
    <Button variant="primary" loading={runNow.isPending} onClick={() => runNow.mutate()}>
      Recalibrar ahora
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Estudio del motor"
        description="Recalibración semanal con guarda, selecciones vetadas y CLV contra la cuota de cierre"
        info="Cada corrida reconstruye el mapa de calibración con la confianza declarada de los picks liquidados (recuperada de los registros del LLM cuando el pick no la guardó), lo valida walk-forward contra el mapa vigente y SOLO lo sustituye si no empeora. También persiste el A/E por selección (mercado + lado + línea) con la marca de veto que lee el pipeline de predicción, y mide el CLV: cuánto se movió la cuota de cierre (alineaciones confirmadas) respecto a la cuota con la que se emitió cada pick. Nada de esta página modifica una predicción ya publicada."
        action={runButton}
      />

      {isError ? (
        <ErrorState
          title="No se pudo cargar el estudio del motor"
          message={error instanceof Error ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <StudyBody data={data} runPending={runNow.isPending} onRun={() => runNow.mutate()} />
      )}
    </div>
  );
}

function StudyBody({
  data,
  runPending,
  onRun,
}: {
  data: EngineStudyOverview;
  runPending: boolean;
  onRun: () => void;
}) {
  const { latest, history, selections, clv, weeklyAe, map, config } = data;
  const hasRuns = latest != null || history.length > 0;

  return (
    <div className="space-y-4">
      {!hasRuns && (
        <Card>
          <EmptyState
            icon={FlaskConical}
            title="Todavía no se ha corrido el estudio del motor."
            description="Pulsa Recalibrar ahora o enciende la recalibración semanal en Config → General (card Motor Predicta calibrado)."
            action={
              <Button variant="primary" loading={runPending} onClick={onRun}>
                Recalibrar ahora
              </Button>
            }
          />
        </Card>
      )}

      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricCard label="Última corrida" value={latest.weekKey} sub={formatDateTime(latest.startedAt)} />
          <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-2">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider font-sans">Veredicto</span>
            <VerdictPill run={latest} />
            <span className="text-xs text-text-muted font-sans">Corrida {triggerLabel(latest.trigger)}</span>
          </div>
          <MetricCard
            label="Observaciones"
            value={latest.observations.toLocaleString()}
            sub={`recuperadas del LLM: ${latest.recoveredObservations.toLocaleString()}`}
          />
          <MetricCard
            label="Validación"
            value={latest.holdoutObservations.toLocaleString()}
            sub={`entrenamiento: ${latest.trainObservations.toLocaleString()} · mínimo 300`}
          />
          <MetricCard
            label="Selecciones vetadas"
            value={latest.vetoedSelections}
            sub="en la última corrida"
            accent={latest.vetoedSelections > 0}
          />
          <MetricCard
            label="Mapa vigente"
            value={map.observations.toLocaleString()}
            sub={`actualizado ${formatDateTime(map.updatedAt)}`}
          />
        </div>
      )}

      {latest && <VerdictCard run={latest} />}

      {latest && <BandCalibrationCard run={latest} />}

      <MapStateCard data={data} />

      <Card
        title="A/E semanal"
        subtitle="Aciertos reales entre los que pagaba la cuota, por semana ISO · solo predicción oficial no-test"
        info="A/E = aciertos / Σ 1/cuota sobre los picks liquidados con cuota de cada semana. A precio justo ronda 0.95 (el margen de la casa va dentro). Es la serie que dice si el motor cobra el precio del mercado o pierde dinero: en las últimas semanas medidas iba de 0.93 a 0.97."
        padded={false}
        bodyClassName="p-0"
      >
        <DataTable<WeeklyAeRow>
          columns={weeklyAeColumns}
          data={weeklyAe}
          keyExtractor={(r) => r.weekKey}
          emptyMessage="Sin semanas liquidadas todavía."
        />
      </Card>

      <PerformanceBreakdownCard />

      <CombinadaPerformanceCard />

      <Card
        title="Selecciones"
        subtitle={`Última corrida completada · piso ${config.selectionMinAe.toFixed(2)} con muestra ${config.selectionMinSample} · filtro ${config.weakSelectionFilter ? 'encendido' : 'apagado'}`}
        info="Una fila por selección (mercado + lado + línea) con picks liquidados en los últimos 90 días. El A/E está encogido hacia 0.95 con peso 15, que es el número contra el que compara el veto. Vetada = por debajo del piso con muestra suficiente: el pipeline marca esos picks como selección débil (si el filtro está encendido) y dejan de entrar en combinadas, Telegram y notificaciones. La falta de historia nunca veta."
        padded={false}
        bodyClassName="p-0"
      >
        <DataTable<EngineSelectionStat>
          columns={selectionColumns}
          data={selections}
          keyExtractor={(r) => r.bucketKey}
          emptyMessage="Sin selecciones: el estudio todavía no ha completado ninguna corrida."
        />
      </Card>

      <ClvCard clv={clv} />

      <Card
        title="Histórico de corridas"
        subtitle="Programadas y manuales, más recientes primero"
        padded={false}
        bodyClassName="p-0"
      >
        <DataTable<EngineStudyRun>
          columns={historyColumns}
          data={history}
          keyExtractor={(r) => r.id}
          emptyMessage="Sin corridas todavía."
        />
      </Card>
    </div>
  );
}

type ScoreScope = 'all' | 'priced';

type HypothesisRow = { label: string; logLoss: number | null; brier: number | null; hint: string };

/** Las cinco hipótesis del veredicto. Con "Todas", el mercado y la mezcla no se
 *  pintan: solo existen sobre la validación con cuota y compararlas contra la
 *  muestra entera mezclaría dos poblaciones distintas. */
function hypothesisRows(run: EngineStudyRun, scope: ScoreScope): HypothesisRow[] {
  const priced = scope === 'priced' ? run.pricedScores : null;
  const weight = run.pricedScores?.blendOddsWeight ?? 0.75;
  const pick = (all: number | null, inPriced: number | null | undefined) =>
    scope === 'priced' ? (inPriced ?? null) : all;
  return [
    {
      label: 'Sin mapa',
      logLoss: pick(run.noMapLogLoss, priced?.noMap?.logLoss),
      brier: pick(run.noMapBrier, priced?.noMap?.brier),
      hint: 'confianza cruda del modelo',
    },
    {
      label: 'Mapa vigente',
      logLoss: pick(run.incumbentLogLoss, priced?.incumbent?.logLoss),
      brier: pick(run.incumbentBrier, priced?.incumbent?.brier),
      hint: 'lo que enseña la app hoy: min(cruda, mapa)',
    },
    {
      label: 'Candidato',
      logLoss: pick(run.candidateLogLoss, priced?.candidate?.logLoss),
      brier: pick(run.candidateBrier, priced?.candidate?.brier),
      hint: 'entrenado solo con el tramo anterior a la validación, con el mismo tope',
    },
    {
      label: 'Mercado (1/cuota)',
      logLoss: priced?.market?.logLoss ?? null,
      brier: priced?.market?.brier ?? null,
      hint: scope === 'priced' ? 'el precio, la referencia a batir' : 'solo con cuota: cambia el selector',
    },
    {
      label: 'Precio + cruda',
      logLoss: priced?.blend?.logLoss ?? null,
      brier: priced?.blend?.brier ?? null,
      hint:
        scope === 'priced'
          ? `${Math.round((1 - weight) * 100)} % cruda + ${Math.round(weight * 100)} % 1/cuota`
          : 'solo con cuota: cambia el selector',
    },
  ];
}

function VerdictCard({ run }: { run: EngineStudyRun }) {
  const [scope, setScope] = useState<ScoreScope>('all');
  const rows = hypothesisRows(run, scope);
  const best = rows.reduce<number | null>(
    (acc, r) => (r.logLoss == null ? acc : acc == null ? r.logLoss : Math.min(acc, r.logLoss)),
    null,
  );
  const missingPriced = scope === 'priced' && run.pricedScores == null;
  const uncapped = run.uncappedScores;

  return (
    <Card
      title="Veredicto del walk-forward"
      subtitle={describeVerdict(run)}
      action={
        <Select
          className="w-40"
          aria-label="Muestra puntuada"
          value={scope}
          onChange={(e) => setScope(e.target.value === 'priced' ? 'priced' : 'all')}
        >
          <option value="all">Todas</option>
          <option value="priced">Solo con cuota</option>
        </Select>
      }
      info={
        <>
          Se decide con log-loss (menor es mejor) y un margen de tolerancia de 0.002: el candidato se aplica si su
          log-loss en validación no supera al del vigente más el margen. El Brier se muestra para contrastar. Con menos
          de 300 observaciones de validación no se decide nada y el mapa vigente queda intacto.
          <br />
          <br />
          Se puntúa lo que corre en producción: el mapa solo puede bajar la confianza, así que cada hipótesis con mapa
          es min(cruda, mapa). Las corridas anteriores al 2026-10-13 puntuaban el mapa sin ese tope.
          <br />
          <br />
          «Solo con cuota» repite todas las hipótesis sobre los picks de la validación que traían cuota, a igual
          muestra, y añade el mercado (1/cuota) y la mezcla precio + cruda. Son informativas: no deciden el veredicto.
          Si «Precio + cruda» gana al «Mapa vigente» aquí dos lunes seguidos, se puede encender la confianza anclada al
          precio (fase 3 del plan del 2026-10-13).
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="overflow-x-auto">
          {scope === 'priced' && run.pricedScores && (
            <p className="text-xs text-text-muted font-sans mb-2">
              {run.pricedScores.n.toLocaleString()} observaciones con cuota de{' '}
              {run.holdoutObservations.toLocaleString()} en validación.
            </p>
          )}
          {missingPriced && (
            <p className="text-xs text-text-muted font-sans mb-2">
              Esta corrida no trae la medición con cuota: llega con la próxima corrida.
            </p>
          )}
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Hipótesis</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-text-muted uppercase tracking-wider">Log-loss</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-text-muted uppercase tracking-wider">Brier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border/70 last:border-0">
                  <td className="px-3 py-2">
                    <div className="text-text-primary">{r.label}</div>
                    <div className="text-xs text-text-muted">{r.hint}</div>
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      best != null && r.logLoss === best ? 'text-emerald-400' : 'text-text-primary',
                    )}
                  >
                    {fmtNum(r.logLoss, 5)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-primary">{fmtNum(r.brier, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {scope === 'all' && uncapped && (uncapped.incumbent || uncapped.candidate) && (
            <p className="text-xs text-text-muted font-sans mt-2">
              Sin el tope, con el mapa tal cual (solo informativo): vigente{' '}
              <span className="tabular-nums text-text-secondary">{fmtNum(uncapped.incumbent?.logLoss, 5)}</span> ·
              candidato <span className="tabular-nums text-text-secondary">{fmtNum(uncapped.candidate?.logLoss, 5)}</span>
            </p>
          )}
        </div>
        <dl className="text-xs font-sans text-text-secondary space-y-1 min-w-56">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Estado</dt>
            <dd>
              <StatusBadge status={run.status} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Modelo</dt>
            <dd className="text-text-primary">{run.model ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Entrenamiento</dt>
            <dd className="text-text-primary">{run.trainObservations.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Validación</dt>
            <dd className="text-text-primary">{run.holdoutObservations.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Inicio</dt>
            <dd className="text-text-primary">{formatDateTime(run.startedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Fin</dt>
            <dd className="text-text-primary">{formatDateTime(run.finishedAt)}</dd>
          </div>
          {run.verdictReason && (
            <div className="pt-1">
              <dt className="text-text-muted">Razón</dt>
              <dd className="text-text-primary break-words">{run.verdictReason}</dd>
            </div>
          )}
          {run.error && (
            <div className="pt-1">
              <dt className="text-danger">Error</dt>
              <dd className="text-danger break-words">{run.error}</dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}

/** Diferencia acierto − mostrada: más de 4 puntos es descalibración visible. */
function gapTone(gap: number): string {
  if (gap > 4) return 'text-amber-400';
  if (gap < -4) return 'text-rose-400';
  return 'text-text-primary';
}

const bandColumns: Column<EngineStudyBandRow>[] = [
  { key: 'band', header: 'Cruda', render: (r) => <span className="font-medium">{r.band} %</span> },
  { key: 'n', header: 'n', render: (r) => r.n.toLocaleString() },
  { key: 'raw', header: 'Cruda media', render: (r) => `${fmtNum(r.rawMean, 1)}%` },
  { key: 'shown', header: 'Mostrada', render: (r) => `${fmtNum(r.shownMean, 1)}%` },
  { key: 'market', header: '1/cuota', render: (r) => (r.marketMean == null ? '—' : `${fmtNum(r.marketMean, 1)}%`) },
  { key: 'hit', header: 'Acierto', render: (r) => `${fmtNum(r.hitRate, 1)}%` },
  {
    key: 'gap',
    header: 'Acierto − mostrada',
    render: (r) => {
      const gap = r.hitRate - r.shownMean;
      return (
        <span className={cn('font-semibold tabular-nums', gapTone(gap))}>
          {gap > 0 ? '+' : ''}
          {fmtNum(gap, 1)}
        </span>
      );
    },
  },
];

function BandCalibrationCard({ run }: { run: EngineStudyRun }) {
  const rows = run.bandReport;
  const priced = rows?.filter((r) => r.priced) ?? [];
  const unpriced = rows?.filter((r) => !r.priced) ?? [];

  return (
    <Card
      title="Calibración por banda"
      subtitle="Validación de la última corrida por banda de confianza cruda: lo que enseña la app frente a lo que aciertan los picks"
      info={
        <>
          Cada fila agrupa los picks de la validación por su confianza cruda (la que declaró el modelo). «Mostrada» es lo
          que vio el usuario con el mapa vigente: min(cruda, mapa). «1/cuota» es lo que decía el precio. «Acierto» es el
          porcentaje real de picks ganados.
          <br />
          <br />
          Si la mostrada queda varios puntos por debajo del acierto (en ámbar), la app infravalora sus picks; si queda
          por encima (en rojo), los sobrevalora. Los picks con cuota y sin cuota se separan porque el mapa se porta
          distinto en cada grupo: sin cuota es donde más ayuda.
        </>
      }
    >
      {!rows ? (
        <p className="text-sm text-text-muted font-sans">
          Sin informe por banda: llega con la próxima corrida del estudio.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider font-sans mb-2">Con cuota</h3>
            <DataTable<EngineStudyBandRow>
              columns={bandColumns}
              data={priced}
              keyExtractor={(r) => `p-${r.band}`}
              emptyMessage="Sin picks con cuota en la validación."
            />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider font-sans mb-2">Sin cuota</h3>
            <DataTable<EngineStudyBandRow>
              columns={bandColumns.filter((c) => c.key !== 'market')}
              data={unpriced}
              keyExtractor={(r) => `u-${r.band}`}
              emptyMessage="Sin picks sin cuota en la validación."
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function MapStateCard({ data }: { data: EngineStudyOverview }) {
  const { map, config } = data;
  return (
    <Card
      title="Estado del mapa y configuración"
      subtitle="Lo que lee applyCalibration hoy, y cómo está programado el estudio"
      info="El mapa de calibración es un singleton: observaciones con las que se construyó, fecha, si ya tiene bins por selección (mercado + lado + línea) además de los bins por mercado, y los modelos con bins propios. Los mercados sin bin caen al bin por mercado o quedan sin calibrar. La configuración se edita en Config → General → card Motor Predicta calibrado → Estudio del motor."
    >
      <div className="grid gap-6 md:grid-cols-2 text-sm font-sans">
        <dl className="space-y-1.5">
          <Row label="Observaciones" value={map.observations.toLocaleString()} />
          <Row label="Actualizado" value={formatDateTime(map.updatedAt)} />
          <Row label="Bins por selección" value={map.hasSelectionBins ? 'sí' : 'todavía no (cae a los bins por mercado)'} />
          <Row label="Modelos con bins" value={map.models.length > 0 ? map.models.join(', ') : '—'} />
          <Row label="Modelo activo" value={config.activeModel} />
          <div className="flex justify-between gap-4 py-1 border-b border-border/60 last:border-0">
            <dt className="text-text-muted">Mercados sin bin</dt>
            <dd className="text-right text-text-primary">
              {map.missingMarkets.length > 0 ? map.missingMarkets.join(', ') : 'ninguno'}
              {map.missingMarkets.includes('total_goals') && (
                <p className="text-xs text-text-muted mt-1 max-w-72">
                  total_goals tardará semanas: su confianza declarada la escriben los selectores del motor solo desde el
                  2026-09-07, así que no se recupera de los registros del LLM.
                </p>
              )}
            </dd>
          </div>
        </dl>
        <dl className="space-y-1.5">
          <Row label="Recalibrar cada semana" value={config.enabled ? 'encendido' : 'apagado'} />
          <Row
            label="Día y hora (Caracas)"
            value={`${WEEKDAY_LABELS[config.dayOfWeek] ?? config.dayOfWeek} · ${String(config.hourCaracas).padStart(2, '0')}:00`}
          />
          <Row label="Días de validación" value={String(config.holdoutDays)} />
          <Row label="Marcar selecciones que pierden" value={config.weakSelectionFilter ? 'encendido' : 'apagado'} />
          <Row label="Piso A/E · muestra mínima" value={`${config.selectionMinAe.toFixed(2)} · ${config.selectionMinSample}`} />
          <div className="pt-2">
            <Link href="/config?tab=general" className="text-primary hover:underline text-xs">
              Editar en Config → General →
            </Link>
          </div>
        </dl>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-border/60 last:border-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right text-text-primary break-words">{value}</dd>
    </div>
  );
}

function ClvCard({ clv }: { clv: EngineStudyOverview['clv'] }) {
  const byMarket: ClvRow[] = clv
    ? Object.entries(clv.byMarket)
        .map(([key, agg]) => ({ key, agg }))
        .sort((a, b) => b.agg.n - a.agg.n)
    : [];
  const bySelection: ClvRow[] = clv
    ? Object.entries(clv.bySelection)
        .map(([key, agg]) => ({ key, agg }))
        .sort((a, b) => b.agg.n - a.agg.n)
        .slice(0, 30)
    : [];

  return (
    <Card
      title="CLV contra la cuota de cierre"
      subtitle="Cuota de cierre (alineaciones confirmadas) frente a la cuota con la que se emitió el pick, misma selección y línea"
      info="CLV = cuota de cierre / cuota de emisión − 1, en %. Positivo = la cuota se ACORTÓ a favor del pick (el mercado se movió hacia lo que dijo el motor); negativo = se alargó en contra. La cuota de emisión es la que el pick llevaba al publicarse (vista official_prediction_pick_stats) y, si falta, la foto de apertura; la de cierre es la captura de la fase 3. Un pick sin foto de cierre cuenta como «sin foto», nunca como 0: la media es solo sobre los emparejados. Es observabilidad: no cambia ninguna predicción."
    >
      {!clv ? (
        <p className="text-sm text-text-muted font-sans">
          Sin CLV todavía: se calcula en cada corrida completada del estudio.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard label="Pares" value={clv.overall.n.toLocaleString()} sub="picks con las dos cuotas" />
            <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-2">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider font-sans">Movimiento medio</span>
              <span className={cn('text-3xl font-bold font-sans leading-none', clvTone(clv.overall.meanPct))}>
                {clv.overall.n > 0 ? `${clv.overall.meanPct > 0 ? '+' : ''}${fmtNum(clv.overall.meanPct, 2)}%` : '—'}
              </span>
              <span className="text-xs text-text-muted font-sans">positivo = a favor del pick</span>
            </div>
            <MetricCard label="Acortadas" value={clv.overall.shortened.toLocaleString()} sub="cierre por debajo de la emisión" />
            <MetricCard label="Alargadas" value={clv.overall.lengthened.toLocaleString()} sub="cierre por encima" />
            <MetricCard label="Sin cambio" value={clv.overall.unchanged.toLocaleString()} />
            <MetricCard label="Sin foto" value={clv.unmatched.toLocaleString()} sub="no cuentan en la media" />
          </div>
          {clv.overall.winRatePct != null && (
            <p className="text-xs text-text-muted font-sans">
              Acierto de los pares ya liquidados:{' '}
              <span className="text-text-primary">{fmtNum(clv.overall.winRatePct, 1)}%</span>
            </p>
          )}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider font-sans mb-2">Por mercado</h3>
            <DataTable<ClvRow>
              columns={clvColumns('Mercado')}
              data={byMarket}
              keyExtractor={(r) => r.key}
              emptyMessage="Sin mercados emparejados."
            />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider font-sans mb-2">
              Por selección (30 con más pares)
            </h3>
            <DataTable<ClvRow>
              columns={clvColumns('Selección')}
              data={bySelection}
              keyExtractor={(r) => r.key}
              emptyMessage="Sin selecciones emparejadas."
            />
          </div>
        </div>
      )}
    </Card>
  );
}

const weeklyAeColumns: Column<WeeklyAeRow>[] = [
  { key: 'week', header: 'Semana', render: (r) => <span className="font-medium">{r.weekKey}</span> },
  { key: 'picks', header: 'Picks', render: (r) => r.picks.toLocaleString() },
  { key: 'won', header: 'Aciertos', render: (r) => r.won.toLocaleString() },
  { key: 'expected', header: 'Esperados (Σ 1/cuota)', render: (r) => fmtNum(r.expected, 1) },
  {
    key: 'ae',
    header: 'A/E',
    render: (r) => <span className={cn('font-semibold tabular-nums', aeTone(r.ae))}>{fmtNum(r.ae, 3)}</span>,
  },
];

const selectionColumns: Column<EngineSelectionStat>[] = [
  { key: 'market', header: 'Mercado', render: (r) => <span className="font-medium">{r.market.replace(/_/g, ' ')}</span> },
  { key: 'pick', header: 'Selección', render: (r) => r.pick },
  { key: 'picks', header: 'Picks', render: (r) => r.picks.toLocaleString() },
  { key: 'won', header: 'Aciertos', render: (r) => r.won.toLocaleString() },
  { key: 'expected', header: 'Esperados', render: (r) => fmtNum(r.expectedWins, 1) },
  {
    key: 'ae',
    header: 'A/E enc.',
    render: (r) => (
      <span className={cn('font-semibold tabular-nums', r.vetoed ? 'text-rose-400' : aeTone(r.shrunkAe))}>
        {fmtNum(r.shrunkAe, 3)}
      </span>
    ),
  },
  {
    key: 'vetoed',
    header: 'Vetada',
    render: (r) =>
      r.vetoed ? (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans uppercase tracking-wide bg-danger/15 text-danger">
          Sí
        </span>
      ) : (
        <span className="text-text-muted text-xs">no</span>
      ),
  },
];

function clvColumns(firstHeader: string): Column<ClvRow>[] {
  return [
    { key: 'key', header: firstHeader, render: (r) => <span className="font-medium">{r.key.replace(/_/g, ' ')}</span> },
    { key: 'n', header: 'n', render: (r) => r.agg.n.toLocaleString() },
    {
      key: 'mean',
      header: 'Movimiento medio',
      render: (r) => (
        <span className={cn('font-semibold tabular-nums', clvTone(r.agg.meanPct))}>
          {r.agg.meanPct > 0 ? '+' : ''}
          {fmtNum(r.agg.meanPct, 2)}%
        </span>
      ),
    },
    { key: 'short', header: 'Acortadas', render: (r) => r.agg.shortened },
    { key: 'long', header: 'Alargadas', render: (r) => r.agg.lengthened },
    { key: 'same', header: 'Sin cambio', render: (r) => r.agg.unchanged },
    {
      key: 'win',
      header: 'Acierto',
      render: (r) => (r.agg.winRatePct == null ? '—' : `${fmtNum(r.agg.winRatePct, 1)}%`),
    },
  ];
}

const historyColumns: Column<EngineStudyRun>[] = [
  { key: 'week', header: 'Semana', render: (r) => <span className="font-medium">{r.weekKey}</span> },
  { key: 'trigger', header: 'Origen', render: (r) => triggerLabel(r.trigger) },
  { key: 'status', header: 'Estado', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'verdict', header: 'Veredicto', render: (r) => <VerdictPill run={r} /> },
  { key: 'obs', header: 'Obs.', render: (r) => r.observations.toLocaleString() },
  { key: 'holdout', header: 'Validación', render: (r) => r.holdoutObservations.toLocaleString() },
  {
    key: 'logloss',
    header: 'Log-loss vigente → candidato',
    render: (r) => (
      <span className="tabular-nums">
        {fmtNum(r.incumbentLogLoss, 4)} → {fmtNum(r.candidateLogLoss, 4)}
      </span>
    ),
  },
  {
    key: 'priced',
    header: 'Con cuota: vigente · precio + cruda',
    render: (r) => {
      const incumbent = r.pricedScores?.incumbent?.logLoss ?? null;
      const blend = r.pricedScores?.blend?.logLoss ?? null;
      const blendWins = incumbent != null && blend != null && blend < incumbent;
      return (
        <span className="tabular-nums">
          {fmtNum(incumbent, 4)} · <span className={cn(blendWins && 'text-emerald-400')}>{fmtNum(blend, 4)}</span>
        </span>
      );
    },
  },
  { key: 'vetoed', header: 'Vetadas', render: (r) => r.vetoedSelections },
  { key: 'started', header: 'Inicio', render: (r) => formatDateTime(r.startedAt) },
  { key: 'finished', header: 'Fin', render: (r) => formatDateTime(r.finishedAt) },
];
