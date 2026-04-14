'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { formatDateTime } from '@/lib/utils';

interface CombinadaPick {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  competitionName: string;
  market: string;
  pick: string;
  confidence: number;
  odds: number | null;
  reasoning: string;
  result: string;
}

interface Combinada {
  id: string;
  date: string;
  type: string;
  legs: number;
  picks: CombinadaPick[];
  combinedConfidence: number;
  combinedOdds: string | null;
  summary: string | null;
  reasoning: string | null;
  model: string;
  settlement: string;
  settledAt: string | null;
  settledPicks: number;
  wonPicks: number;
  createdAt: string;
}

interface CombinadaStats {
  total: number;
  won: number;
  settled: number;
  successRate: number | null;
  avgConfidence: number;
  today: number;
}

interface CombinadaJob {
  id: number;
  status: string;
  date: string;
  basePredictionsGenerated: number;
  combinadasGenerated: number;
  failed: number;
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export default function CombinadasPage() {
  const [tab, setTab] = useState<'list' | 'jobs'>('list');
  const [detailId, setDetailId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['combinada-stats'],
    queryFn: () => api.get<CombinadaStats>('/admin/combinadas/stats'),
    refetchInterval: 30_000,
  });

  const { data: combinadas, isLoading } = useQuery({
    queryKey: ['combinadas'],
    queryFn: () => api.get<{ data: Combinada[] }>('/admin/combinadas'),
    refetchInterval: 30_000,
  });

  const { data: jobs } = useQuery({
    queryKey: ['combinada-jobs'],
    queryFn: () => api.get<{ data: CombinadaJob[] }>('/admin/combinada-jobs'),
    enabled: tab === 'jobs',
    refetchInterval: 15_000,
  });

  const { data: detail } = useQuery({
    queryKey: ['combinada-detail', detailId],
    queryFn: () => api.get<Combinada>(`/admin/combinadas/${detailId}`),
    enabled: !!detailId,
  });

  const generateMut = useMutation({
    mutationFn: () => api.post<{ message: string }>('/admin/combinadas/generate'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combinada-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['combinadas'] });
    },
  });

  const combinadaColumns: Column<Combinada>[] = [
    {
      key: 'settlement',
      header: 'Status',
      render: (c) => <StatusBadge status={c.settlement} />,
    },
    {
      key: 'type',
      header: 'Type',
      render: (c) => (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.type === 'premium' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
          {c.type}
        </span>
      ),
    },
    { key: 'legs', header: 'Legs', render: (c) => <span>{c.legs}</span> },
    {
      key: 'picks',
      header: 'Matches',
      render: (c) => (
        <span className="text-xs text-text-secondary truncate max-w-[250px] inline-block">
          {c.picks.map((p) => `${p.homeTeam} v ${p.awayTeam}`).join(' / ')}
        </span>
      ),
    },
    {
      key: 'combinedConfidence',
      header: 'Confidence',
      render: (c) => <span className="font-mono">{c.combinedConfidence}%</span>,
    },
    {
      key: 'combinedOdds',
      header: 'Odds',
      render: (c) => <span className="font-mono">{c.combinedOdds ?? '-'}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (c) => <span>{c.date}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <button
          className="text-xs text-primary hover:underline"
          onClick={() => setDetailId(c.id)}
        >
          View
        </button>
      ),
    },
  ];

  const jobColumns: Column<CombinadaJob>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (j) => <StatusBadge status={j.status} />,
    },
    { key: 'date', header: 'Date', render: (j) => <span>{j.date}</span> },
    { key: 'model', header: 'Model', render: (j) => <span>{j.model ?? '-'}</span> },
    {
      key: 'basePredictionsGenerated',
      header: 'Base Preds',
      render: (j) => <span>{j.basePredictionsGenerated}</span>,
    },
    {
      key: 'combinadasGenerated',
      header: 'Combinadas',
      render: (j) => <span>{j.combinadasGenerated}</span>,
    },
    { key: 'failed', header: 'Failed', render: (j) => <span>{j.failed}</span> },
    {
      key: 'startedAt',
      header: 'Started',
      render: (j) => <span>{j.startedAt ? formatDateTime(j.startedAt) : '-'}</span>,
    },
    {
      key: 'finishedAt',
      header: 'Completed',
      render: (j) => <span>{j.finishedAt ? formatDateTime(j.finishedAt) : '-'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Combinadas"
        description="Multi-match parlay predictions"
        action={
          <button
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
          >
            {generateMut.isPending ? 'Generating...' : 'Generate Now'}
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Combinadas" value={stats?.total ?? 0} sub="All time" />
        <MetricCard
          label="Success Rate"
          value={stats?.successRate != null ? `${stats.successRate}%` : '-'}
          sub={`${stats?.won ?? 0} won / ${stats?.settled ?? 0} settled`}
          accent
        />
        <MetricCard label="Avg Confidence" value={stats?.avgConfidence ? `${stats.avgConfidence}%` : '-'} sub="Combined" />
        <MetricCard label="Today" value={stats?.today ?? 0} sub="Active combinadas" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'list' ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
          onClick={() => setTab('list')}
        >
          Combinadas
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'jobs' ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
          onClick={() => setTab('jobs')}
        >
          Generation Jobs
        </button>
      </div>

      {tab === 'list' && (
        <DataTable<Combinada>
          columns={combinadaColumns}
          data={combinadas?.data ?? []}
          loading={isLoading}
          keyExtractor={(c) => c.id}
        />
      )}

      {tab === 'jobs' && (
        <DataTable<CombinadaJob>
          columns={jobColumns}
          data={jobs?.data ?? []}
          loading={!jobs}
          keyExtractor={(j) => j.id}
        />
      )}

      {/* Detail modal */}
      {detailId && detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailId(null)}>
          <div
            className="bg-surface-1 rounded-2xl border max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">
                Combinada Detail
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${detail.type === 'premium' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {detail.type}
                </span>
              </h2>
              <button className="text-text-muted hover:text-text-primary" onClick={() => setDetailId(null)}>
                &times;
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div>
                <span className="text-text-muted">Confidence</span>
                <p className="font-mono text-text-primary">{detail.combinedConfidence}%</p>
              </div>
              <div>
                <span className="text-text-muted">Odds</span>
                <p className="font-mono text-text-primary">{detail.combinedOdds ?? '-'}</p>
              </div>
              <div>
                <span className="text-text-muted">Settlement</span>
                <p><StatusBadge status={detail.settlement} /></p>
              </div>
            </div>

            {detail.summary && (
              <div className="mb-4 p-3 rounded-lg bg-surface-2 text-sm text-text-secondary">{detail.summary}</div>
            )}

            <h3 className="text-sm font-medium text-text-primary mb-2">Picks ({detail.legs} legs)</h3>
            <div className="space-y-2">
              {detail.picks.map((pick, i) => (
                <div key={i} className="p-3 rounded-lg bg-surface-2 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-primary font-medium">{pick.homeTeam} vs {pick.awayTeam}</span>
                    <StatusBadge status={pick.result} />
                  </div>
                  <div className="flex gap-4 text-text-muted text-xs">
                    <span>{pick.competitionName}</span>
                    <span className="font-mono">{pick.market}: {pick.pick}</span>
                    <span className="font-mono">{pick.confidence}%</span>
                    {pick.odds && <span className="font-mono">@{pick.odds}</span>}
                  </div>
                  <p className="text-text-secondary text-xs mt-1">{pick.reasoning}</p>
                </div>
              ))}
            </div>

            {detail.reasoning && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-text-primary mb-2">LLM Reasoning</h3>
                <div className="p-3 rounded-lg bg-surface-2 text-sm text-text-secondary whitespace-pre-wrap">{detail.reasoning}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
