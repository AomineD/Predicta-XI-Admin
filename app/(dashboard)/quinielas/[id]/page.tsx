'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MetricCard } from '@/components/ui/MetricCard';
import { Tabs } from '@/components/ui/Tabs';
import { formatDateTime } from '@/lib/utils';

interface QuinielaPick {
  id: string;
  phase: 'phase1' | 'phase2';
  category: string;
  subjectKey: string | null;
  value: Record<string, unknown>;
  confidence: number;
  reasoning: string | null;
  settlement: 'pending' | 'won' | 'lost' | 'partial' | 'void';
  settledAt: string | null;
  actualValue: Record<string, unknown> | null;
  model: string;
  createdAt: string | null;
}

interface QuinielaJob {
  id: number;
  phase: 'phase1' | 'phase2';
  status: string;
  triggeredBy: string;
  model: string | null;
  picksGenerated: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
}

interface QuinielaDetail {
  quiniela: {
    id: string;
    competitionId: number;
    seasonYear: string;
    name: string;
    status: string;
    tournamentStartsAt: string;
    tournamentEndsAt: string | null;
    phase1GeneratedAt: string | null;
    phase2GeneratedAt: string | null;
    settledAt: string | null;
    creditsCharged: number;
    createdAt: string | null;
  };
  picks: QuinielaPick[];
  jobs: QuinielaJob[];
  paidUsersCount: number;
}

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'phase1',  label: 'Phase 1 Picks' },
  { id: 'phase2',  label: 'Phase 2 Picks' },
  { id: 'jobs',    label: 'LLM Jobs' },
];

export default function QuinielaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<string>('summary');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['quiniela-detail', id],
    queryFn: () => api.get<QuinielaDetail>(`/admin/quinielas/${id}`),
    refetchInterval: 15_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['quiniela-detail', id] });

  const lockMut = useMutation({
    mutationFn: () => api.post(`/admin/quinielas/${id}/lock`),
    onSuccess: invalidate,
  });

  const generatePhase1Mut = useMutation({
    mutationFn: (regenerate: boolean) =>
      api.post(`/admin/quinielas/${id}/generate-phase1`, { regenerate }),
    onSuccess: invalidate,
  });

  const generatePhase2Mut = useMutation({
    mutationFn: (regenerate: boolean) =>
      api.post(`/admin/quinielas/${id}/generate-phase2`, { regenerate }),
    onSuccess: invalidate,
  });

  const settleAutoMut = useMutation<{ evaluated: number; settled: number; pending: number; skipped: number }>({
    mutationFn: () =>
      api.post(`/admin/quinielas/${id}/settle-auto`),
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return <p className="text-text-muted">Loading…</p>;
  }

  const { quiniela, picks, jobs, paidUsersCount } = data;
  const settledPicks = picks.filter((p) => p.settlement !== 'pending' && p.settlement !== 'void').length;
  const phase1Picks = picks.filter((p) => p.phase === 'phase1');
  const phase2Picks = picks.filter((p) => p.phase === 'phase2');

  const canLock = quiniela.status === 'phase1_generated' || quiniela.status === 'phase2_generated';
  const canGeneratePhase1 = quiniela.status === 'draft';
  const canRegeneratePhase1 = quiniela.status === 'phase1_generated';
  const canGeneratePhase2 = quiniela.status === 'phase1_locked';
  const canRegeneratePhase2 = quiniela.status === 'phase2_generated';
  const canSettleAuto = quiniela.status === 'phase1_locked'
    || quiniela.status === 'phase2_generated'
    || quiniela.status === 'phase2_locked';

  const genError =
    (generatePhase1Mut.error as Error | undefined)?.message ??
    (generatePhase2Mut.error as Error | undefined)?.message ??
    null;

  return (
    <>
      <PageHeader
        title={quiniela.name}
        description={`${quiniela.seasonYear} · Tournament: ${formatDateTime(quiniela.tournamentStartsAt)}${quiniela.tournamentEndsAt ? ` → ${formatDateTime(quiniela.tournamentEndsAt)}` : ''}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatusBadge status={quiniela.status} />
            {canGeneratePhase1 && (
              <Button onClick={() => generatePhase1Mut.mutate(false)} loading={generatePhase1Mut.isPending} variant="primary">
                Generate Phase 1
              </Button>
            )}
            {canRegeneratePhase1 && (
              <Button onClick={() => generatePhase1Mut.mutate(true)} loading={generatePhase1Mut.isPending}>
                Regenerate Phase 1
              </Button>
            )}
            {canGeneratePhase2 && (
              <Button onClick={() => generatePhase2Mut.mutate(false)} loading={generatePhase2Mut.isPending} variant="primary">
                Generate Phase 2
              </Button>
            )}
            {canRegeneratePhase2 && (
              <Button onClick={() => generatePhase2Mut.mutate(true)} loading={generatePhase2Mut.isPending}>
                Regenerate Phase 2
              </Button>
            )}
            {canLock && (
              <Button onClick={() => lockMut.mutate()} loading={lockMut.isPending} variant="primary">
                Publish ({quiniela.status === 'phase1_generated' ? 'Phase 1' : 'Phase 2'})
              </Button>
            )}
            {canSettleAuto && (
              <Button onClick={() => settleAutoMut.mutate()} loading={settleAutoMut.isPending}>
                Settle auto
              </Button>
            )}
          </div>
        }
      />
      {settleAutoMut.data && (
        <div className="mb-4 rounded-xl p-3 text-sm" style={{ background: 'rgba(124,255,91,0.1)', border: '1px solid rgba(124,255,91,0.3)', color: '#7CFF5B' }}>
          Evaluated {settleAutoMut.data.evaluated} · Settled {settleAutoMut.data.settled} · Pending {settleAutoMut.data.pending} · Skipped {settleAutoMut.data.skipped}
        </div>
      )}
      {genError && (
        <div className="mb-4 rounded-xl p-3 text-sm text-danger" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {genError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Phase 1 picks" value={phase1Picks.length} />
        <MetricCard label="Phase 2 picks" value={phase2Picks.length} />
        <MetricCard label="Settled" value={`${settledPicks}/${picks.length}`} accent />
        <MetricCard label="Paid users" value={paidUsersCount} />
      </div>

      <Tabs value={tab} onChange={setTab} items={TABS} />

      <div className="mt-6">
        {tab === 'summary' && <SummaryTab quiniela={quiniela} />}
        {tab === 'phase1' && <PicksTab picks={phase1Picks} quinielaId={id} />}
        {tab === 'phase2' && <PicksTab picks={phase2Picks} quinielaId={id} />}
        {tab === 'jobs' && <JobsTab jobs={jobs} />}
      </div>
    </>
  );
}

function SummaryTab({ quiniela }: { quiniela: QuinielaDetail['quiniela'] }) {
  return (
    <div
      className="rounded-2xl p-6 space-y-3"
      style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <Row label="Status" value={<StatusBadge status={quiniela.status} />} />
      <Row label="Competition ID" value={String(quiniela.competitionId)} />
      <Row label="Season year" value={quiniela.seasonYear} />
      <Row label="Tournament starts" value={formatDateTime(quiniela.tournamentStartsAt)} />
      <Row label="Tournament ends" value={formatDateTime(quiniela.tournamentEndsAt)} />
      <Row label="Phase 1 generated" value={formatDateTime(quiniela.phase1GeneratedAt)} />
      <Row label="Phase 2 generated" value={formatDateTime(quiniela.phase2GeneratedAt)} />
      <Row label="Settled at" value={formatDateTime(quiniela.settledAt)} />
      <Row label="Credits charged (snapshot)" value={String(quiniela.creditsCharged)} />
      <Row label="Created at" value={formatDateTime(quiniela.createdAt)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted font-sans">{label}</span>
      <span className="text-text-primary font-sans">{value}</span>
    </div>
  );
}

function PicksTab({ picks, quinielaId }: { picks: QuinielaPick[]; quinielaId: string }) {
  if (picks.length === 0) {
    return <p className="text-text-muted text-sm">No picks generated for this phase yet.</p>;
  }
  // Group picks by category.
  const grouped = picks.reduce<Record<string, QuinielaPick[]>>((acc, pick) => {
    acc[pick.category] = acc[pick.category] ?? [];
    acc[pick.category].push(pick);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-2 font-sans">
            {category.replace(/_/g, ' ')}
          </h3>
          <div className="space-y-2">
            {items.map((pick) => (
              <PickRow key={pick.id} pick={pick} quinielaId={quinielaId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PickRow({ pick, quinielaId }: { pick: QuinielaPick; quinielaId: string }) {
  const queryClient = useQueryClient();
  const [showSettleManual, setShowSettleManual] = useState(false);

  const isManualOnly = pick.category === 'mvp' || pick.category === 'best_young_player' || pick.category === 'best_goalkeeper';

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {pick.subjectKey && (
            <div className="text-xs text-text-muted font-mono mb-1">{pick.subjectKey}</div>
          )}
          <div className="text-sm text-text-primary font-sans">
            <pre className="font-mono text-xs whitespace-pre-wrap">{JSON.stringify(pick.value, null, 2)}</pre>
          </div>
          {pick.reasoning && (
            <p className="text-xs text-text-secondary mt-2 italic">{pick.reasoning}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusBadge status={pick.settlement} />
          <span className="text-xs text-text-muted font-mono">{pick.confidence}%</span>
          {isManualOnly && pick.settlement === 'pending' && (
            <Button size="sm" variant="secondary" onClick={() => setShowSettleManual(true)}>
              Settle
            </Button>
          )}
        </div>
      </div>
      {showSettleManual && (
        <SettleManualModal
          pickId={pick.id}
          quinielaId={quinielaId}
          onClose={() => setShowSettleManual(false)}
          onSuccess={() => {
            setShowSettleManual(false);
            queryClient.invalidateQueries({ queryKey: ['quiniela-detail', quinielaId] });
          }}
        />
      )}
    </div>
  );
}

function SettleManualModal({
  pickId,
  quinielaId,
  onClose,
  onSuccess,
}: {
  pickId: string;
  quinielaId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [settlement, setSettlement] = useState<'won' | 'lost' | 'partial' | 'void'>('won');
  const [actualValueRaw, setActualValueRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const settleMut = useMutation({
    mutationFn: () => {
      let actualValue: Record<string, unknown> | null = null;
      if (actualValueRaw.trim()) {
        try {
          actualValue = JSON.parse(actualValueRaw);
        } catch {
          throw new Error('actualValue must be valid JSON');
        }
      }
      return api.post(`/admin/quinielas/${quinielaId}/settle-pick`, {
        pickId,
        settlement,
        actualValue,
      });
    },
    onSuccess,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-text-primary font-sans">Manual settlement</h2>

        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Settlement</label>
          <select
            value={settlement}
            onChange={(e) => setSettlement(e.target.value as typeof settlement)}
            className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
          >
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="partial">Partial</option>
            <option value="void">Void</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Actual value (JSON, optional)
          </label>
          <textarea
            value={actualValueRaw}
            onChange={(e) => setActualValueRaw(e.target.value)}
            placeholder='{ "playerName": "..." }'
            rows={4}
            className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary font-mono"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button onClick={() => settleMut.mutate()} loading={settleMut.isPending} variant="primary">
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function JobsTab({ jobs }: { jobs: QuinielaJob[] }) {
  if (jobs.length === 0) {
    return <p className="text-text-muted text-sm">No LLM jobs yet.</p>;
  }
  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="rounded-xl p-3 flex items-center justify-between"
          style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-text-muted">#{job.id}</span>
            <span className="text-sm text-text-primary font-sans">{job.phase}</span>
            <StatusBadge status={job.status} />
            <span className="text-xs text-text-muted">picks: {job.picksGenerated}</span>
            {job.model && <span className="text-xs text-text-muted font-mono">{job.model}</span>}
          </div>
          <div className="text-xs text-text-muted">{formatDateTime(job.finishedAt ?? job.startedAt ?? job.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}
