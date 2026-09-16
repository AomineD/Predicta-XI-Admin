'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Select } from '@/components/ui/inputs';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import {
  PERFORMANCE_DIMENSION_OPTIONS,
  PERFORMANCE_WINDOWS,
  aeTone,
  fetchPerformanceBreakdown,
  fmtNum,
  fmtSigned,
  performanceDimensionLabel,
  performanceKeyLabel,
  type PerformanceBreakdown,
  type PerformanceDimension,
  type PerformanceRow,
} from './engine-study-api';

const MIN_SAMPLES = [0, 30, 100, 300] as const;

/**
 * Rendimiento de los picks oficiales por dimensión (plan "motor sin sesgos", fase 4).
 *
 * Acierto, precio, A/E y ROI van SIEMPRE en la misma fila: el acierto a secas premia
 * la cuota corta y es justo lo que escondía el 60.8 % titular. Los picks sin cuota
 * se cuentan aparte y no entran en ninguna cifra de precio.
 */
export function PerformanceBreakdownCard() {
  const [dimension, setDimension] = useState<PerformanceDimension>('risk_group');
  const [days, setDays] = useState<number>(90);
  const [minSample, setMinSample] = useState<number>(30);

  const { data, isLoading, isError, error } = useQuery<PerformanceBreakdown>({
    queryKey: ['engine-performance', 'picks', dimension, days, minSample],
    queryFn: () => fetchPerformanceBreakdown({ dimension, days, minSample }),
    staleTime: 60_000,
  });

  return (
    <Card
      title="Rendimiento por dimensión"
      subtitle="Picks liquidados de la predicción oficial · acierto, precio, A/E y ROI siempre juntos"
      info={
        <>
          Solo cuentan los picks ganados o perdidos de la predicción oficial no-test (los anulados devuelven el stake y
          no dicen nada). <strong>Acierto</strong>, <strong>Cuota media</strong>, <strong>Equilibrio</strong>,{' '}
          <strong>A/E</strong> y <strong>ROI plano</strong> se miden solo sobre los picks con cuota. Equilibrio es el
          acierto que exige el precio: la media de 1/cuota, así que Acierto ÷ Equilibrio = A/E (a precio justo ronda
          0.95, el margen de la casa va dentro). No se usa 100/cuota media porque en los tramos de cuota alta queda por
          debajo y hace parecer rentable lo que pierde. ROI plano = retorno a stake 1 por pick. <strong>Sin
          cuota</strong> cuenta los picks sin precio de referencia todavía, con su acierto aparte. Un pick puede estar
          en dos ejes; el total de arriba lo cuenta una sola vez. La <strong>fuente de cuota</strong> es estimada: se
          cuenta Sportium cuando el partido tenía foto de Sportium de ese mercado antes de generarse la predicción
          (Sportium manda en la fusión); el resto con cuota sale de otra fuente. La
          muestra mínima filtra por picks de la fila.
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Control label="Dimensión">
          <Select
            className="w-44"
            value={dimension}
            onChange={(e) => setDimension(e.target.value as PerformanceDimension)}
          >
            {PERFORMANCE_DIMENSION_OPTIONS.map((o) => (
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
        <Control label="Muestra mín.">
          <Select className="w-28" value={minSample} onChange={(e) => setMinSample(Number(e.target.value))}>
            {MIN_SAMPLES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Todo' : `${n}+`}
              </option>
            ))}
          </Select>
        </Control>
      </div>

      {isError ? (
        <p className="text-xs text-danger font-sans">
          {error instanceof Error ? error.message : 'No se pudo cargar el rendimiento.'}
        </p>
      ) : isLoading || !data ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          <OverallStrip row={data.overall} days={data.windowDays} />
          <div className="overflow-x-auto">
            <DataTable<PerformanceRow>
              columns={columnsFor(data)}
              data={data.rows}
              keyExtractor={(r) => r.key}
              emptyMessage="Sin picks liquidados en esta ventana con esa muestra."
            />
          </div>
          {data.belowSample > 0 && (
            <p className="text-xs text-text-muted font-sans">
              {data.belowSample.toLocaleString()} {data.belowSample === 1 ? 'fila oculta' : 'filas ocultas'} por tener
              menos de {data.minSample} picks.
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

function OverallStrip({ row, days }: { row: PerformanceRow; days: number }) {
  const items: Array<{ label: string; value: string; note: string; tone?: string }> = [
    { label: 'Picks', value: row.picks.toLocaleString(), note: `${days} d · ${row.priced.toLocaleString()} con cuota` },
    {
      label: 'Acierto',
      value: row.winratePct == null ? '—' : `${fmtNum(row.winratePct, 1)}%`,
      note: `equilibrio ${row.breakEvenPct == null ? '—' : `${fmtNum(row.breakEvenPct, 1)}%`}`,
    },
    { label: 'A/E', value: fmtNum(row.ae, 3), note: 'aciertos / Σ 1/cuota', tone: aeTone(row.ae) },
    {
      label: 'ROI plano',
      value: fmtSigned(row.roiPct, 1, '%'),
      note: `cuota media ${fmtNum(row.avgOdds, 2)}`,
      tone: row.roiPct == null ? undefined : row.roiPct >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'Sin cuota',
      value: row.unpriced.toLocaleString(),
      note: row.unpricedWinratePct == null ? 'sin muestra' : `acierto ${fmtNum(row.unpricedWinratePct, 1)}%`,
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-xl overflow-hidden bg-border border border-border">
      {items.map((item) => (
        <div key={item.label} className="bg-surface-2 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-sans">{item.label}</p>
          <p className={cn('text-xl font-semibold tabular-nums font-sans mt-0.5', item.tone ?? 'text-text-primary')}>
            {item.value}
          </p>
          <p className="text-[11px] text-text-muted font-sans mt-0.5">{item.note}</p>
        </div>
      ))}
    </div>
  );
}

function columnsFor(data: PerformanceBreakdown): Column<PerformanceRow>[] {
  return [
    {
      key: 'key',
      header: performanceDimensionLabel(data.dimension),
      render: (r) => (
        <span className="font-medium whitespace-nowrap">
          {performanceKeyLabel(data.dimension, r.key, data.principalMaxOdds)}
        </span>
      ),
    },
    { key: 'picks', header: 'Picks', render: (r) => <span className="tabular-nums">{r.picks.toLocaleString()}</span> },
    { key: 'priced', header: 'Con cuota', render: (r) => <span className="tabular-nums">{r.priced.toLocaleString()}</span> },
    {
      key: 'winrate',
      header: 'Acierto',
      render: (r) => <span className="tabular-nums">{r.winratePct == null ? '—' : `${fmtNum(r.winratePct, 1)}%`}</span>,
    },
    { key: 'odds', header: 'Cuota media', render: (r) => <span className="tabular-nums">{fmtNum(r.avgOdds, 2)}</span> },
    {
      key: 'breakEven',
      header: 'Equilibrio',
      render: (r) => (
        <span className="tabular-nums text-text-muted">{r.breakEvenPct == null ? '—' : `${fmtNum(r.breakEvenPct, 1)}%`}</span>
      ),
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
      key: 'unpriced',
      header: 'Sin cuota',
      render: (r) =>
        r.unpriced === 0 ? (
          <span className="text-text-muted">—</span>
        ) : (
          <span className="tabular-nums whitespace-nowrap">
            {r.unpriced.toLocaleString()}
            <span className="text-text-muted"> · {fmtNum(r.unpricedWinratePct, 1)}%</span>
          </span>
        ),
    },
  ];
}
