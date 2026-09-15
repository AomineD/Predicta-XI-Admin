'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { MetricCard } from '@/components/ui/MetricCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select, Textarea } from '@/components/ui/inputs';
import { useToast } from '@/components/ui/ToastProvider';

type FeedbackKind = 'prediction_report' | 'combinada_report' | 'general';
type FeedbackStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

interface FeedbackContext {
  predictionId?: string;
  matchApiFootballId?: number;
  combinadaId?: string;
  tierId?: string;
  appVersion?: string;
  platform?: string;
  locale?: string;
}

interface FeedbackItem {
  id: string;
  userId: string;
  userEmail: string | null;
  userDisplayName: string | null;
  kind: FeedbackKind;
  reason: string;
  message: string | null;
  context: FeedbackContext;
  status: FeedbackStatus;
  adminNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  match: { apiFootballId: number; homeTeam: string; awayTeam: string } | null;
}

interface FeedbackPage {
  items: FeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface FeedbackSummary {
  open: number;
  inReview: number;
}

// Espejo de FEEDBACK_REASONS del backend (`db/schema/user-feedback.ts`).
const REASONS: Record<FeedbackKind, string[]> = {
  prediction_report: ['missing_markets', 'wrong_settlement', 'wrong_data', 'confusing_text', 'loading_error', 'other'],
  combinada_report: ['wrong_settlement', 'wrong_leg_data', 'loading_error', 'other'],
  general: ['suggestion', 'bug', 'credits_payments', 'other'],
};

const KIND_LABEL: Record<FeedbackKind, string> = {
  prediction_report: 'Prediction',
  combinada_report: 'AI combinada',
  general: 'General',
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const STATUS_CLASS: Record<FeedbackStatus, string> = {
  open: 'bg-warning/15 text-warning',
  in_review: 'bg-secondary/15 text-secondary',
  resolved: 'bg-success/15 text-success',
  dismissed: 'bg-text-muted/15 text-text-muted',
};

const PAGE_SIZE = 50;

function humanize(key: string): string {
  const text = key.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function StatusPill({ status }: { status: FeedbackStatus }) {
  return (
    <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-semibold uppercase whitespace-nowrap ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function targetLabel(item: FeedbackItem): string {
  if (item.match) return `${item.match.homeTeam} vs ${item.match.awayTeam}`;
  if (item.context.combinadaId) return `Combinada ${item.context.combinadaId.slice(0, 8)}…`;
  if (item.context.matchApiFootballId != null) return `Match #${item.context.matchApiFootballId}`;
  return '—';
}

export default function FeedbackInboxPage() {
  const [status, setStatus] = useState<FeedbackStatus | 'all'>('open');
  const [kind, setKind] = useState<FeedbackKind | 'all'>('all');
  const [reason, setReason] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status !== 'all') params.set('status', status);
    if (kind !== 'all') params.set('kind', kind);
    if (reason !== 'all') params.set('reason', reason);
    return `/admin/feedback?${params.toString()}`;
  }, [status, kind, reason, page]);

  const list = useQuery<FeedbackPage>({
    queryKey: ['feedback', status, kind, reason, page],
    queryFn: () => api.get(query),
  });
  const summary = useQuery<FeedbackSummary>({
    queryKey: ['feedback-summary'],
    queryFn: () => api.get('/admin/feedback/summary'),
  });

  const reasonOptions = kind === 'all' ? [...new Set(Object.values(REASONS).flat())] : REASONS[kind];
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  const columns: Column<FeedbackItem>[] = [
    {
      key: 'createdAt',
      header: 'Received',
      width: 'w-40',
      render: (row) => <span className="text-xs text-text-secondary whitespace-nowrap">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="min-w-40">
          <p className="text-text-primary">{row.userDisplayName ?? '—'}</p>
          <p className="text-xs text-text-muted">{row.userEmail ?? row.userId}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Type',
      render: (row) => (
        <div>
          <p className="text-text-primary">{humanize(row.reason)}</p>
          <p className="text-xs text-text-muted">{KIND_LABEL[row.kind]}</p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (row) => <span className="text-text-secondary">{targetLabel(row)}</span>,
    },
    {
      key: 'message',
      header: 'Comment',
      render: (row) => (
        <p className="text-text-secondary max-w-xs truncate" title={row.message ?? undefined}>
          {row.message ?? <span className="text-text-muted">No comment</span>}
        </p>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} /> },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button size="sm" onClick={() => setSelected(row)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Feedback"
        description="Problem reports and comments sent from the app."
        info="Users send these from the Intelligence Report, the AI combinada detail, Settings → Support and the Help center. The channel is one-way: changing the status or writing a note never reaches the user. The note is internal. Turn the channel on or off in Config → Maintenance → User feedback."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <MetricCard label="Open" value={summary.data?.open} />
        <MetricCard label="In review" value={summary.data?.inReview} />
        <MetricCard label="In this view" value={list.data?.total} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['open', 'in_review', 'resolved', 'dismissed', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => { setStatus(value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full border text-xs font-sans ${status === value ? 'bg-primary/15 border-primary text-primary' : 'bg-surface-2 border-border text-text-muted'}`}
          >
            {value === 'all' ? 'All' : STATUS_LABEL[value]}
          </button>
        ))}
        <div className="flex gap-2 ml-auto">
          <Select
            className="w-44"
            value={kind}
            onChange={(e) => { setKind(e.target.value as FeedbackKind | 'all'); setReason('all'); setPage(1); }}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            {(Object.keys(KIND_LABEL) as FeedbackKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </Select>
          <Select
            className="w-48"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setPage(1); }}
            aria-label="Filter by reason"
          >
            <option value="all">All reasons</option>
            {reasonOptions.map((r) => (
              <option key={r} value={r}>{humanize(r)}</option>
            ))}
          </Select>
        </div>
      </div>

      {list.isError ? (
        <ErrorState
          title="Couldn't load feedback"
          message={list.error instanceof Error ? list.error.message : undefined}
          onRetry={() => list.refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          data={list.data?.items ?? []}
          keyExtractor={(row) => row.id}
          loading={list.isLoading}
          emptyMessage="No reports in this view."
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 mt-4">
          <span className="text-xs text-text-muted font-sans">Page {page} of {totalPages}</span>
          <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {selected && <FeedbackDetailModal key={selected.id} item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function FeedbackDetailModal({ item, onClose }: { item: FeedbackItem; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [note, setNote] = useState(item.adminNote ?? '');

  const dirty = status !== item.status || note.trim() !== (item.adminNote ?? '');

  const save = useMutation({
    mutationFn: () => {
      const body: { status?: FeedbackStatus; adminNote?: string | null } = {};
      if (status !== item.status) body.status = status;
      if (note.trim() !== (item.adminNote ?? '')) body.adminNote = note.trim() === '' ? null : note;
      return api.patch<FeedbackItem>(`/admin/feedback/${item.id}`, body);
    },
    onSuccess: () => {
      toast.success('Feedback updated.');
      qc.invalidateQueries({ queryKey: ['feedback'] });
      qc.invalidateQueries({ queryKey: ['feedback-summary'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const contextRows: Array<[string, string | number | undefined]> = [
    ['Match', item.match ? `${item.match.homeTeam} vs ${item.match.awayTeam} (#${item.match.apiFootballId})` : item.context.matchApiFootballId],
    ['Prediction id', item.context.predictionId],
    ['Combinada id', item.context.combinadaId],
    ['Tier id', item.context.tierId],
    ['App version', item.context.appVersion],
    ['Platform', item.context.platform],
    ['Locale', item.context.locale],
  ];

  return (
    <Modal
      open
      // Con el guardado en vuelo no se cierra: el toast y la invalidación llegan a
      // un modal ya desmontado y el operador no ve si se aplicó.
      onClose={() => { if (!save.isPending) onClose(); }}
      closeOnBackdrop={!save.isPending}
      size="lg"
      title={`${humanize(item.reason)} · ${KIND_LABEL[item.kind]}`}
      description={`${item.userDisplayName ?? 'Unnamed user'} · ${item.userEmail ?? item.userId} · ${formatDate(item.createdAt)}`}
      info="Changing the status or the note does not notify the user. Resolved and dismissed record who closed it and when; reopening clears that."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 font-sans text-sm">
        <div>
          <p className="text-xs text-text-muted mb-1">Comment</p>
          <p className="text-text-primary whitespace-pre-wrap break-words rounded-xl bg-surface-2 border border-border px-3 py-2">
            {item.message ?? <span className="text-text-muted">No comment</span>}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted mb-1">Context</p>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
            {contextRows
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([label, v]) => (
                <div key={label} className="contents">
                  <dt className="text-text-muted">{label}</dt>
                  <dd className="text-text-primary font-mono text-xs break-all self-center">{v}</dd>
                </div>
              ))}
          </dl>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-text-muted">Status</span>
            <Select className="mt-1" value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
              {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </label>
          <div>
            <span className="text-xs text-text-muted">Closed by</span>
            <p className="mt-2 text-text-secondary">
              {item.resolvedBy ? `${item.resolvedBy} · ${formatDate(item.resolvedAt)}` : '—'}
            </p>
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-text-muted">Internal note</span>
          <Textarea className="mt-1" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only visible in the admin panel" />
        </label>
      </div>
    </Modal>
  );
}
