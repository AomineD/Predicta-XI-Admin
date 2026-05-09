'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { formatDate, formatPct, cn } from '@/lib/utils';

interface PredictionRow {
  model: string;
  predictions: number;
  settledLegs: number;
  wins: number;
  losses: number;
  pickWinrate: number | null;
  avgConfidence: number | null;
  avgLatencyMs: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface CombinadaRow {
  model: string;
  total: number;
  won: number;
  lost: number;
  pending: number;
  winrate: number | null;
  avgConfidence: number | null;
  avgOdds: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface CombinadaTierRow {
  model: string;
  type: 'regular' | 'premium';
  legs: number;
  n: number;
  won: number;
  lost: number;
  winrate: number | null;
}

interface ModelWinrateResponse {
  windowDays: number;
  predictions: PredictionRow[];
  combinadas: CombinadaRow[];
  combinadasByTier: CombinadaTierRow[];
}

const WINDOW_OPTIONS = [
  { id: '7', label: '7d' },
  { id: '30', label: '30d' },
  { id: '60', label: '60d' },
  { id: '90', label: '90d' },
  { id: '180', label: '180d' },
];

const MIN_PREDICTIONS_SAMPLE = 5;
const MIN_COMBINADAS_SAMPLE = 10;

function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function winrateColor(pct: number | null, neutralPivot = 50): string {
  if (pct == null) return 'text-text-muted';
  if (pct >= neutralPivot + 10) return 'text-emerald-400';
  if (pct >= neutralPivot) return 'text-text-primary';
  if (pct >= neutralPivot - 15) return 'text-amber-400';
  return 'text-rose-400';
}

export default function ModelsPage() {
  const [windowDays, setWindowDays] = useState('60');

  const { data, isLoading } = useQuery<ModelWinrateResponse>({
    queryKey: ['model-winrate', windowDays],
    queryFn: () => api.get(`/admin/stats/model-winrate?days=${windowDays}`),
    staleTime: 60_000,
  });

  const topPickModel = data?.predictions
    .filter((r) => r.predictions >= MIN_PREDICTIONS_SAMPLE)
    .reduce<PredictionRow | null>((best, row) => {
      if (row.pickWinrate == null) return best;
      if (!best || (best.pickWinrate ?? 0) < row.pickWinrate) return row;
      return best;
    }, null);

  const topCombinadaModel = data?.combinadas
    .filter((r) => r.total >= MIN_COMBINADAS_SAMPLE)
    .reduce<CombinadaRow | null>((best, row) => {
      if (row.winrate == null) return best;
      if (!best || (best.winrate ?? 0) < row.winrate) return row;
      return best;
    }, null);

  const predictionColumns: Column<PredictionRow>[] = [
    {
      key: 'model',
      header: 'Model',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{row.model}</span>
          {row.predictions < MIN_PREDICTIONS_SAMPLE && (
            <span className="text-[10px] uppercase tracking-wider text-amber-400">low n</span>
          )}
        </div>
      ),
    },
    { key: 'predictions', header: 'Predictions', render: (row) => row.predictions.toLocaleString() },
    { key: 'settledLegs', header: 'Legs settled', render: (row) => row.settledLegs.toLocaleString() },
    {
      key: 'pickWinrate',
      header: 'Pick winrate',
      render: (row) => (
        <span className={cn('font-semibold', winrateColor(row.pickWinrate))}>
          {formatPct(row.pickWinrate)}
        </span>
      ),
    },
    { key: 'avgConfidence', header: 'Avg conf', render: (row) => (row.avgConfidence != null ? row.avgConfidence.toFixed(1) : '—') },
    { key: 'avgLatency', header: 'Avg latency', render: (row) => formatLatency(row.avgLatencyMs) },
    {
      key: 'window',
      header: 'Active',
      render: (row) => (
        <span className="text-text-muted text-xs">
          {formatDate(row.firstSeen)} → {formatDate(row.lastSeen)}
        </span>
      ),
    },
  ];

  const combinadaColumns: Column<CombinadaRow>[] = [
    {
      key: 'model',
      header: 'Model',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{row.model}</span>
          {row.total < MIN_COMBINADAS_SAMPLE && (
            <span className="text-[10px] uppercase tracking-wider text-amber-400">low n</span>
          )}
        </div>
      ),
    },
    { key: 'total', header: 'Total', render: (row) => row.total.toLocaleString() },
    { key: 'won', header: 'Won', render: (row) => row.won.toLocaleString() },
    { key: 'lost', header: 'Lost', render: (row) => row.lost.toLocaleString() },
    {
      key: 'winrate',
      header: 'Winrate',
      render: (row) => (
        <span className={cn('font-semibold', winrateColor(row.winrate))}>
          {formatPct(row.winrate)}
        </span>
      ),
    },
    { key: 'avgConfidence', header: 'Avg conf', render: (row) => (row.avgConfidence != null ? row.avgConfidence.toFixed(1) : '—') },
    { key: 'avgOdds', header: 'Avg odds', render: (row) => (row.avgOdds != null ? row.avgOdds.toFixed(2) : '—') },
    {
      key: 'window',
      header: 'Active',
      render: (row) => (
        <span className="text-text-muted text-xs">
          {formatDate(row.firstSeen)} → {formatDate(row.lastSeen)}
        </span>
      ),
    },
  ];

  const tierColumns: Column<CombinadaTierRow>[] = [
    { key: 'model', header: 'Model', render: (row) => <span className="font-medium text-text-primary">{row.model}</span> },
    {
      key: 'type',
      header: 'Tier',
      render: (row) => (
        <span
          className={cn(
            'px-2 py-0.5 rounded-md text-xs font-medium uppercase tracking-wider',
            row.type === 'premium' ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-500/15 text-blue-300',
          )}
        >
          {row.type}
        </span>
      ),
    },
    { key: 'legs', header: 'Legs', render: (row) => row.legs.toLocaleString() },
    { key: 'n', header: 'Total', render: (row) => row.n.toLocaleString() },
    { key: 'won', header: 'Won', render: (row) => row.won.toLocaleString() },
    { key: 'lost', header: 'Lost', render: (row) => row.lost.toLocaleString() },
    {
      key: 'winrate',
      header: 'Winrate',
      render: (row) => (
        <span className={cn('font-semibold', winrateColor(row.winrate))}>
          {formatPct(row.winrate)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Models"
        description="LLM A/B winrate for predictions and combinadas. Switch the active model in Config and revisit weekly."
        action={
          <Tabs
            value={windowDays}
            onChange={setWindowDays}
            items={WINDOW_OPTIONS}
          />
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Window"
          value={`${data?.windowDays ?? windowDays}d`}
          sub="Rolling. Tab switches re-query the API."
        />
        <MetricCard
          label="Top pick winrate"
          value={topPickModel ? formatPct(topPickModel.pickWinrate) : '—'}
          sub={topPickModel ? `${topPickModel.model} · ${topPickModel.predictions} predictions` : `Need ≥${MIN_PREDICTIONS_SAMPLE} predictions`}
          accent
        />
        <MetricCard
          label="Top combinada winrate"
          value={topCombinadaModel ? formatPct(topCombinadaModel.winrate) : '—'}
          sub={topCombinadaModel ? `${topCombinadaModel.model} · ${topCombinadaModel.total} combinadas` : `Need ≥${MIN_COMBINADAS_SAMPLE} combinadas`}
          accent
        />
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 font-sans">
          Predictions · pick-level (V2 only)
        </h2>
        <DataTable
          columns={predictionColumns}
          data={data?.predictions ?? []}
          keyExtractor={(row) => row.model}
          loading={isLoading}
          emptyMessage="No predictions in this window"
        />
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 font-sans">
          Combinadas · whole-parlay settlement
        </h2>
        <DataTable
          columns={combinadaColumns}
          data={data?.combinadas ?? []}
          keyExtractor={(row) => row.model}
          loading={isLoading}
          emptyMessage="No combinadas in this window"
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 font-sans">
          Combinadas · by tier × legs
        </h2>
        <DataTable
          columns={tierColumns}
          data={data?.combinadasByTier ?? []}
          keyExtractor={(row) => `${row.model}|${row.type}|${row.legs}`}
          loading={isLoading}
          emptyMessage="No combinadas in this window"
        />
      </section>
    </div>
  );
}
