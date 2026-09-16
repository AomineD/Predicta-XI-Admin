'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/inputs';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import {
  COMBINADA_DIMENSION_OPTIONS,
  PERFORMANCE_WINDOWS,
  aeTone,
  combinadaDimensionLabel,
  combinadaValueLabel,
  fetchCombinadaPerformance,
  fmtNum,
  fmtSigned,
  type CombinadaPerformance,
  type CombinadaPerformanceDimension,
  type CombinadaPerformanceRow,
} from './engine-study-api';

/**
 * Combinadas liquidadas por tipo (plan "motor sin sesgos", fase 4). Es donde se ven
 * lado a lado la Segura premium, la Segura regular y la premium del día, con la
 * confianza que vio el usuario frente a la implícita de su cuota.
 */
export function CombinadaPerformanceCard() {
  const [primary, setPrimary] = useState<CombinadaPerformanceDimension>('tier');
  const [secondary, setSecondary] = useState<CombinadaPerformanceDimension | ''>('theme');
  const [days, setDays] = useState<number>(90);

  const dimensions: CombinadaPerformanceDimension[] = secondary ? [primary, secondary] : [primary];

  const { data, isLoading, isError, error } = useQuery<CombinadaPerformance>({
    queryKey: ['engine-performance', 'combinadas', dimensions.join(','), days],
    queryFn: () => fetchCombinadaPerformance({ dimensions, days }),
    staleTime: 60_000,
  });

  const changePrimary = (value: CombinadaPerformanceDimension): void => {
    setPrimary(value);
    // El backend rechaza la misma dimensión dos veces: se quita la segunda.
    if (value === secondary) setSecondary('');
  };

  return (
    <Card
      title="Combinadas por tipo"
      subtitle="Liquidadas con resultado final · acierto, precio, A/E, ROI y confianza mostrada frente a la implícita"
      info={
        <>
          Solo combinadas reales (no-test) ganadas o perdidas; las anuladas no cuentan. Se agrupa por una dimensión o
          por un par: con <strong>Tier</strong> y <strong>Tema</strong> se ven la Segura premium, la Segura regular y las
          del día sin tema por separado (la semanal va dentro de su tier y tema; agrupa por <strong>Alcance</strong> para
          separarla). <strong>Acierto</strong> cuenta todas; lo de precio (cuota media, equilibrio, A/E y ROI plano) solo
          las que tienen cuota combinada. <strong>Equilibrio</strong> e <strong>Implícita</strong> son la media de
          100/cuota. <strong>Diferencia</strong> = confianza mostrada − implícita: negativa es una cifra por debajo de lo
          que paga el precio, positiva una que promete más de lo que el precio respalda. Con pocas liquidadas por fila,
          sirve para detectar un desastre, no para afinar.
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Control label="Agrupar por">
          <Select
            className="w-40"
            value={primary}
            onChange={(e) => changePrimary(e.target.value as CombinadaPerformanceDimension)}
          >
            {COMBINADA_DIMENSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Control>
        <Control label="Y por">
          <Select
            className="w-40"
            value={secondary}
            onChange={(e) => setSecondary(e.target.value as CombinadaPerformanceDimension | '')}
          >
            <option value="">—</option>
            {COMBINADA_DIMENSION_OPTIONS.filter((o) => o.value !== primary).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Control>
        <Control label="Ventana">
          <Select className="w-28" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {PERFORMANCE_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w} d
              </option>
            ))}
          </Select>
        </Control>
      </div>

      {isError ? (
        <p className="text-xs text-danger font-sans">
          {error instanceof Error ? error.message : 'No se pudo cargar el rendimiento de las combinadas.'}
        </p>
      ) : isLoading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <DataTable<CombinadaPerformanceRow>
              columns={columnsFor(data)}
              data={data.rows}
              keyExtractor={(r) => r.key}
              emptyMessage="Sin combinadas liquidadas en esta ventana."
            />
          </div>
          {data.overall.settled > 0 && (
            <p className="text-xs text-text-muted font-sans">
              Total: {data.overall.settled.toLocaleString()} liquidadas · acierto{' '}
              <span className="text-text-primary">{fmtNum(data.overall.winratePct, 1)}%</span> · A/E{' '}
              <span className={aeTone(data.overall.ae)}>{fmtNum(data.overall.ae, 3)}</span> · ROI plano{' '}
              <span className="text-text-primary">{fmtSigned(data.overall.roiPct, 1, '%')}</span> · diferencia{' '}
              <span className="text-text-primary">{fmtSigned(data.overall.confidenceGapPts, 1, ' pts')}</span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted font-sans uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function pct(value: number | null): string {
  return value == null ? '—' : `${fmtNum(value, 1)}%`;
}

function columnsFor(data: CombinadaPerformance): Column<CombinadaPerformanceRow>[] {
  const groupColumns: Column<CombinadaPerformanceRow>[] = data.dimensions.map((dimension) => ({
    key: `group-${dimension}`,
    header: combinadaDimensionLabel(dimension),
    render: (r) => (
      <span className="font-medium whitespace-nowrap">{combinadaValueLabel(dimension, r.groups[dimension])}</span>
    ),
  }));

  return [
    ...groupColumns,
    { key: 'settled', header: 'Liquidadas', render: (r) => <span className="tabular-nums">{r.settled.toLocaleString()}</span> },
    {
      key: 'winrate',
      header: 'Acierto',
      render: (r) => (
        <span className="tabular-nums whitespace-nowrap">
          {pct(r.winratePct)}
          <span className="text-text-muted"> · {r.won}</span>
        </span>
      ),
    },
    { key: 'odds', header: 'Cuota media', render: (r) => <span className="tabular-nums">{fmtNum(r.avgOdds, 2)}</span> },
    {
      key: 'breakEven',
      header: 'Equilibrio',
      render: (r) => <span className="tabular-nums text-text-muted">{pct(r.breakEvenPct)}</span>,
    },
    {
      key: 'ae',
      header: 'A/E',
      render: (r) => <span className={cn('font-semibold tabular-nums', aeTone(r.ae))}>{fmtNum(r.ae, 3)}</span>,
    },
    {
      key: 'roi',
      header: 'ROI plano',
      render: (r) => (
        <span
          className={cn(
            'tabular-nums',
            r.roiPct == null ? 'text-text-muted' : r.roiPct >= 0 ? 'text-emerald-400' : 'text-rose-400',
          )}
        >
          {fmtSigned(r.roiPct, 1, '%')}
        </span>
      ),
    },
    {
      key: 'confidence',
      header: 'Confianza',
      render: (r) => <span className="tabular-nums">{fmtNum(r.avgConfidence, 1)}</span>,
    },
    {
      key: 'implied',
      header: 'Implícita',
      render: (r) => <span className="tabular-nums text-text-muted">{fmtNum(r.avgImpliedPct, 1)}</span>,
    },
    {
      key: 'gap',
      header: 'Diferencia',
      render: (r) => (
        <span
          className={cn(
            'tabular-nums',
            r.confidenceGapPts == null
              ? 'text-text-muted'
              : r.confidenceGapPts > 0
                ? 'text-rose-400'
                : r.confidenceGapPts < -8
                  ? 'text-amber-400'
                  : 'text-text-primary',
          )}
        >
          {fmtSigned(r.confidenceGapPts, 1)}
        </span>
      ),
    },
  ];
}
