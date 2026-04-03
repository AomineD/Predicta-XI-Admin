'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────

interface PredictionJob {
  id: string;
  status: string;
  model: string;
  totalMatches: number;
  predicted: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorLog: unknown;
}

interface SyncJob {
  id: number;
  type: string;
  status: string;
  synced: number;
  updated: number;
  errors: number;
  duration: number | null;
  errorLog: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface JobsResponse<T> {
  items: T[];
}

type Tab = 'predictions' | 'sync';

// ── Helpers ────────────────────────────────────────────────

const SYNC_TYPE_LABELS: Record<string, string> = {
  match_sync: 'Match Sync',
  result_sync: 'Result Sync',
  enrichment: 'Enrichment',
  full_sync: 'Full Sync',
};

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncateLog(log: string | null, maxLen = 80): string {
  if (!log) return '';
  return log.length > maxLen ? log.slice(0, maxLen) + '…' : log;
}

// ── Log Modal ──────────────────────────────────────────────

function LogModal({ log, onClose }: { log: string; onClose: () => void }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(log);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary font-sans">Error Log</h3>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
            >
              Copy
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto text-xs text-text-muted font-mono whitespace-pre-wrap p-4 rounded-xl bg-surface-3">
          {log}
        </pre>
      </div>
    </div>
  );
}

// ── Tab Button ─────────────────────────────────────────────

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-sans font-semibold uppercase tracking-wider rounded-lg transition-colors ${
        active
          ? 'bg-primary text-background'
          : 'bg-surface-3 text-text-secondary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function JobsPage() {
  const [tab, setTab] = useState<Tab>('sync');
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const { data: predictionData, isLoading: predLoading } = useQuery<JobsResponse<PredictionJob>>({
    queryKey: ['jobs'],
    queryFn: () => api.get('/admin/jobs'),
    refetchInterval: 10_000,
  });

  const { data: syncData, isLoading: syncLoading } = useQuery<JobsResponse<SyncJob>>({
    queryKey: ['sync-jobs'],
    queryFn: () => api.get('/admin/sync-jobs'),
    refetchInterval: 10_000,
  });

  // ── Prediction job columns ──

  const predictionColumns: Column<PredictionJob>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'model',
      header: 'Model',
      render: (row) => <span className="text-text-secondary text-xs">{row.model ?? '—'}</span>,
    },
    {
      key: 'processed',
      header: 'Processed',
      render: (row) => <span className="font-semibold text-text-primary text-sm">{row.totalMatches ?? 0}</span>,
    },
    {
      key: 'results',
      header: 'OK / Failed',
      render: (row) => (
        <span className="text-sm font-sans">
          <span className="text-success">{row.predicted ?? 0}</span>
          <span className="text-text-muted"> / </span>
          <span className="text-danger">{row.failed ?? 0}</span>
        </span>
      ),
    },
    {
      key: 'started',
      header: 'Started',
      render: (row) => <span className="text-text-muted text-xs">{formatDateTime(row.startedAt)}</span>,
    },
    {
      key: 'completed',
      header: 'Completed',
      render: (row) => <span className="text-text-muted text-xs">{formatDateTime(row.finishedAt)}</span>,
    },
    {
      key: 'error',
      header: 'Error',
      render: (row) => {
        const log = row.errorLog ? JSON.stringify(row.errorLog) : null;
        if (!log) return <span className="text-text-muted text-xs">—</span>;
        return (
          <button onClick={() => setSelectedLog(log)} className="text-danger text-xs truncate max-w-xs block text-left hover:underline cursor-pointer">
            {truncateLog(log)}
          </button>
        );
      },
    },
  ];

  // ── Sync job columns ──

  const syncColumns: Column<SyncJob>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className="text-text-secondary text-xs font-medium">{SYNC_TYPE_LABELS[row.type] ?? row.type}</span>
      ),
    },
    {
      key: 'synced',
      header: 'New / Updated',
      render: (row) => (
        <span className="text-sm font-sans">
          <span className="text-success">{row.synced}</span>
          <span className="text-text-muted"> / </span>
          <span className="text-primary">{row.updated}</span>
        </span>
      ),
    },
    {
      key: 'errors',
      header: 'Errors',
      render: (row) => (
        <span className={`text-sm font-sans ${row.errors > 0 ? 'text-danger' : 'text-text-muted'}`}>
          {row.errors}
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (row) => <span className="text-text-muted text-xs">{formatDuration(row.duration)}</span>,
    },
    {
      key: 'started',
      header: 'Started',
      render: (row) => <span className="text-text-muted text-xs">{formatDateTime(row.startedAt)}</span>,
    },
    {
      key: 'completed',
      header: 'Completed',
      render: (row) => <span className="text-text-muted text-xs">{formatDateTime(row.finishedAt)}</span>,
    },
    {
      key: 'error',
      header: 'Log',
      render: (row) => {
        if (!row.errorLog) return <span className="text-text-muted text-xs">—</span>;
        return (
          <button onClick={() => setSelectedLog(row.errorLog!)} className="text-danger text-xs truncate max-w-xs block text-left hover:underline cursor-pointer">
            {truncateLog(row.errorLog)}
          </button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Jobs" description="Scheduler job history — auto-refreshes every 10s" />

      <div className="flex gap-2 mb-4">
        <TabButton active={tab === 'sync'} label="Sync Jobs" onClick={() => setTab('sync')} />
        <TabButton active={tab === 'predictions'} label="Prediction Jobs" onClick={() => setTab('predictions')} />
      </div>

      {tab === 'sync' && (
        <DataTable
          columns={syncColumns}
          data={syncData?.items ?? []}
          keyExtractor={(r) => r.id}
          loading={syncLoading}
          emptyMessage="No sync jobs found"
        />
      )}

      {tab === 'predictions' && (
        <DataTable
          columns={predictionColumns}
          data={predictionData?.items ?? []}
          keyExtractor={(r) => r.id}
          loading={predLoading}
          emptyMessage="No prediction jobs found"
        />
      )}

      {selectedLog && <LogModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
