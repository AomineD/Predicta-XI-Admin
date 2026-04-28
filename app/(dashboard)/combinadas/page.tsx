'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';
import { CombinadaDetailModal, type CombinadaModalData } from '@/components/combinadas/CombinadaDetailModal';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  // Bulk delete is restricted to today's combinadas (backend enforces this).
  // Compute today's date in UTC to match the backend's date storage format.
  const todayUtc = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isToday = (combinada: Combinada) => combinada.date.slice(0, 10) === todayUtc;

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

  // Fetch current risk mode so the modal can display a ModeBadge. Combinadas
  // don't persist their own risk_mode yet (see followup), so historical rows
  // will show whatever is configured right now.
  const { data: predictionConfig } = useQuery({
    queryKey: ['prediction-config'],
    queryFn: () => api.get<{ combinadasRiskMode?: string }>('/admin/prediction-config'),
  });
  const currentRiskMode = predictionConfig?.combinadasRiskMode;

  const generateMut = useMutation({
    mutationFn: () => api.post<{ message: string }>('/admin/combinadas/generate'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combinada-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['combinadas'] });
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ deletedCount: number; accessRowsDeleted: number; skippedIds: string[]; message: string }>(
        '/admin/combinadas/bulk-delete',
        { ids },
      ),
    onSuccess: () => {
      // Invalidate stats too — `today` count drops after deletion.
      queryClient.invalidateQueries({ queryKey: ['combinadas'] });
      queryClient.invalidateQueries({ queryKey: ['combinada-stats'] });
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
    },
  });

  const todaysCombinadas = useMemo(
    () => (combinadas?.data ?? []).filter(isToday),
    [combinadas, todayUtc], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const todayDeletableIds = useMemo(() => todaysCombinadas.map((c) => c.id), [todaysCombinadas]);
  const allTodaySelected = todayDeletableIds.length > 0 && todayDeletableIds.every((id) => selectedIds.has(id));
  const toggleSelectAllToday = () => {
    if (allTodaySelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(todayDeletableIds));
    }
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const combinadaColumns: Column<Combinada>[] = [
    {
      key: 'select',
      header: '',
      width: 'w-10',
      render: (c) => {
        // Only today's combinadas are deletable. Render a disabled placeholder
        // for historical rows so the column alignment stays consistent.
        if (!isToday(c)) {
          return <span className="inline-block w-4 h-4" />;
        }
        return (
          <input
            type="checkbox"
            checked={selectedIds.has(c.id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleOne(c.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 cursor-pointer accent-primary"
            aria-label={`Select combinada ${c.id}`}
          />
        );
      },
    },
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
            className="px-4 py-2 bg-primary text-black text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50"
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
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'list' ? 'bg-primary text-black' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
          onClick={() => setTab('list')}
        >
          Combinadas
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'jobs' ? 'bg-primary text-black' : 'bg-surface-2 text-text-secondary hover:text-text-primary'}`}
          onClick={() => setTab('jobs')}
        >
          Generation Jobs
        </button>
      </div>

      {tab === 'list' && (
        <>
          {/* Selection toolbar — appears above the table to handle "select all
              today" and trigger bulk delete. Only counts today's combinadas
              because deletion is restricted to today's date server-side. */}
          {todayDeletableIds.length > 0 && (
            <div
              className="flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allTodaySelected}
                  onChange={toggleSelectAllToday}
                  className="w-4 h-4 cursor-pointer accent-primary"
                  aria-label="Select all today's combinadas"
                />
                <span>
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : `Select all today's combinadas (${todayDeletableIds.length})`}
                </span>
              </label>
              <Button
                variant="danger"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete selected
              </Button>
            </div>
          )}

          <DataTable<Combinada>
            columns={combinadaColumns}
            data={combinadas?.data ?? []}
            loading={isLoading}
            keyExtractor={(c) => c.id}
          />
        </>
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
      <CombinadaDetailModal
        data={detailId && detail ? (detail as unknown as CombinadaModalData) : null}
        onClose={() => setDetailId(null)}
        currentRiskMode={currentRiskMode}
      />

      {/* Bulk delete confirmation modal — mirrors the danger-modal pattern
          used in /config so the visual language stays consistent. */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className="rounded-2xl p-6 w-full max-w-md"
            style={{ background: '#121A2B', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary font-sans">
                  Delete {selectedIds.size} combinada{selectedIds.size === 1 ? '' : 's'}?
                </h3>
                <p className="text-xs text-red-400 font-sans">This cannot be undone</p>
              </div>
            </div>
            <div
              className="rounded-xl p-3 mb-5"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <p className="text-xs text-red-300 font-sans">
                The selected combinadas and any related user-access rows will be permanently removed from the database.
                Restricted to today's combinadas only.
              </p>
              <p className="text-xs text-text-muted font-sans mt-2">
                Tip: after deleting, click <strong className="text-text-primary">Generate Now</strong> to repopulate today's combinadas with the current config.
              </p>
            </div>
            {bulkDeleteMut.isError && (
              <p className="text-xs text-red-400 font-sans mb-3">
                {(bulkDeleteMut.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={bulkDeleteMut.isPending}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={bulkDeleteMut.isPending}
                onClick={() => bulkDeleteMut.mutate(Array.from(selectedIds))}
              >
                Yes, delete {selectedIds.size}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
