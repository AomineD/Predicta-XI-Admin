'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

interface SyncJobProgress {
  phase: number;
  totalPhases: number;
  phaseName: string;
  current: number;
  total: number;
  itemLabel: string;
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
  progress: SyncJobProgress | null;
}

interface JobsResponse<T> {
  items: T[];
}

interface SchedulerInfo {
  enabled: boolean;
  isRunning: boolean;
  nextRunAt: string;
  interval: string;
}

interface SchedulerStatus {
  predictions: SchedulerInfo;
  matchSync: SchedulerInfo;
  resultSync: SchedulerInfo;
  enrichmentSync: SchedulerInfo;
}

type Tab = 'predictions' | 'sync';

// ── Helpers ────────────────────────────────────────────────

const SYNC_TYPE_LABELS: Record<string, string> = {
  match_sync: 'Match Sync',
  result_sync: 'Result Sync',
  enrichment: 'Enrichment',
  full_sync: 'Full Sync',
  competition_sync: 'Competition Sync',
  team_sync: 'Team Sync',
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

// ── Scheduler Countdown Banners ───────────────────────────

function useCountdown(nextRunAt: string): number {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const diff = Math.floor((new Date(nextRunAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    const diff = Math.floor((new Date(nextRunAt).getTime() - Date.now()) / 1000);
    setSecondsLeft(Math.max(0, diff));

    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [nextRunAt]);

  return secondsLeft;
}

function formatCountdown(s: number): string {
  if (s <= 0) return 'any moment now';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

function SchedulerBanner({ label, info }: { label: string; info: SchedulerInfo }) {
  const secondsLeft = useCountdown(info.nextRunAt);
  const nextRunDate = new Date(info.nextRunAt);
  const timeStr = nextRunDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  if (!info.enabled) {
    return (
      <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="w-2 h-2 rounded-full bg-text-muted flex-none" />
        <span className="text-sm text-text-muted font-sans">{label}</span>
        <span className="text-xs text-text-muted font-sans ml-auto">disabled</span>
      </div>
    );
  }

  if (info.isRunning) {
    return (
      <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: '#121A2B', border: '1px solid rgba(124,255,91,0.3)' }}>
        <span className="w-2 h-2 rounded-full bg-success animate-pulse flex-none" />
        <span className="text-sm text-text-secondary font-sans">{label}</span>
        <span className="text-sm text-success font-sans font-medium ml-auto">Running now...</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: '#121A2B', border: '1px solid rgba(77,168,255,0.2)' }}>
      <span className="w-2 h-2 rounded-full bg-blue-400 flex-none" />
      <span className="text-sm text-text-secondary font-sans">{label}</span>
      <span className="text-sm font-semibold text-blue-400 font-mono">{formatCountdown(secondsLeft)}</span>
      <span className="text-xs text-text-muted font-sans ml-auto">at {timeStr} · every {info.interval}</span>
    </div>
  );
}

function SchedulerBanners({ status }: { status: SchedulerStatus }) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <SchedulerBanner label="Match Sync" info={status.matchSync} />
      <SchedulerBanner label="Result Sync" info={status.resultSync} />
      <SchedulerBanner label="Enrichment Sync" info={status.enrichmentSync} />
      <SchedulerBanner label="Predictions" info={status.predictions} />
    </div>
  );
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

// ── Cancel Confirmation Modal ─────────────────────────

function CancelModal({ jobType, jobId, onConfirm, onClose }: { jobType: string; jobId: string | number; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-2xl p-6 w-full max-w-sm"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center flex-none">
            <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary font-sans">Cancel Job</h3>
            <p className="text-xs text-text-muted font-sans">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-text-secondary font-sans mb-6">
          Are you sure you want to cancel {jobType} job <span className="font-mono text-text-primary">#{jobId}</span>?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
          >
            Go Back
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-xs font-sans font-medium bg-danger text-white hover:bg-danger/90 transition-colors"
          >
            Cancel Job
          </button>
        </div>
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
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('sync');
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ type: 'sync' | 'prediction'; id: string | number } | null>(null);

  const cancelSyncJob = useMutation({
    mutationFn: (id: number) => api.post(`/admin/sync-jobs/${id}/cancel`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sync-jobs'] }); setCancelTarget(null); },
  });

  const cancelPredictionJob = useMutation({
    mutationFn: (id: string) => api.post(`/admin/jobs/${id}/cancel`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); setCancelTarget(null); },
  });

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

  const { data: schedulerStatus } = useQuery<SchedulerStatus>({
    queryKey: ['scheduler-status'],
    queryFn: () => api.get('/admin/scheduler-status'),
    refetchInterval: 30_000,
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
        const log = row.errorLog ? (Array.isArray(row.errorLog) ? (row.errorLog as string[]).join('\n') : JSON.stringify(row.errorLog)) : null;
        if (!log) return <span className="text-text-muted text-xs">—</span>;
        return (
          <button onClick={() => setSelectedLog(log)} className="text-danger text-xs truncate max-w-xs block text-left hover:underline cursor-pointer">
            {truncateLog(log)}
          </button>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      render: (row) => {
        if (row.status !== 'running' && row.status !== 'pending') return null;
        return (
          <button
            onClick={() => setCancelTarget({ type: 'prediction', id: row.id })}
            className="px-2.5 py-1 rounded-lg text-xs font-sans font-medium bg-danger/15 text-danger hover:bg-danger/25 transition-colors"
          >
            Cancel
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
      render: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} />
          {row.progress && (
            <div className="text-xs text-text-muted leading-tight">
              <span className="text-text-secondary">Phase {row.progress.phase}/{row.progress.totalPhases}:</span>{' '}
              {row.progress.phaseName}
              {row.progress.total > 0 && (
                <span className="block">
                  {row.progress.itemLabel} {row.progress.current}/{row.progress.total}
                </span>
              )}
            </div>
          )}
        </div>
      ),
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
    {
      key: 'actions',
      header: '',
      render: (row) => {
        if (row.status !== 'running') return null;
        return (
          <button
            onClick={() => setCancelTarget({ type: 'sync', id: row.id })}
            className="px-2.5 py-1 rounded-lg text-xs font-sans font-medium bg-danger/15 text-danger hover:bg-danger/25 transition-colors"
          >
            Cancel
          </button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Jobs" description="Scheduler job history — auto-refreshes every 10s" />

      {schedulerStatus && <SchedulerBanners status={schedulerStatus} />}

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

      {cancelTarget && (
        <CancelModal
          jobType={cancelTarget.type === 'sync' ? 'sync' : 'prediction'}
          jobId={cancelTarget.id}
          onConfirm={() => {
            if (cancelTarget.type === 'sync') {
              cancelSyncJob.mutate(cancelTarget.id as number);
            } else {
              cancelPredictionJob.mutate(cancelTarget.id as string);
            }
          }}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
