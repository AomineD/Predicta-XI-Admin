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

interface QuinielaJobProgress {
  kind: 'sync_history';
  total: number;
  pending: number;
  running: number;
  retrying: number;
  completed: number;
  failed: number;
  cancelled: number;
}

interface QuinielaJob {
  id: number;
  phase: 'phase1' | 'phase2' | null;
  operation?: 'generate' | 'reset' | 'sync_history';
  status: string;
  triggeredBy: string;
  model: string | null;
  picksGenerated: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  progress?: QuinielaJobProgress | null;
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
  const [resetTarget, setResetTarget] = useState<'phase1' | 'phase2' | 'all' | null>(null);
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

  // Fire-and-forget: server returns { jobId, status: 'pending' }; the dispatcher
  // picks it up. Polling at refetchInterval=15s surfaces the result.
  const generatePhase1Mut = useMutation<{ jobId: number; status: string }, Error, boolean>({
    mutationFn: (regenerate: boolean) =>
      api.post(`/admin/quinielas/${id}/generate-phase1`, { regenerate }),
    onSuccess: invalidate,
  });

  const generatePhase2Mut = useMutation<{ jobId: number; status: string }, Error, boolean>({
    mutationFn: (regenerate: boolean) =>
      api.post(`/admin/quinielas/${id}/generate-phase2`, { regenerate }),
    onSuccess: invalidate,
  });

  const syncHistoryMut = useMutation<{ jobId: number; status: string }, Error, void>({
    mutationFn: () => api.post(`/admin/quinielas/${id}/sync-team-history`),
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
  const canResetPhase1 = phase1Picks.length > 0 && quiniela.status !== 'settled';
  const canResetPhase2 = phase2Picks.length > 0 && quiniela.status !== 'settled';

  // Pending/running jobs that haven't shown up in picks yet — we surface a
  // tiny banner so the admin sees "queued / running" feedback after clicking
  // a fire-and-forget button.
  const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'running');

  const genError =
    (generatePhase1Mut.error as Error | undefined)?.message ??
    (generatePhase2Mut.error as Error | undefined)?.message ??
    (syncHistoryMut.error as Error | undefined)?.message ??
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
            <Button onClick={() => syncHistoryMut.mutate()} loading={syncHistoryMut.isPending}>
              Sync team history
            </Button>
            {(canResetPhase1 || canResetPhase2) && (
              <div className="flex items-center gap-1">
                {canResetPhase1 && (
                  <Button variant="danger" onClick={() => setResetTarget('phase1')}>
                    Reset Phase 1
                  </Button>
                )}
                {canResetPhase2 && (
                  <Button variant="danger" onClick={() => setResetTarget('phase2')}>
                    Reset Phase 2
                  </Button>
                )}
                {canResetPhase1 && canResetPhase2 && (
                  <Button variant="danger" onClick={() => setResetTarget('all')}>
                    Reset all
                  </Button>
                )}
              </div>
            )}
          </div>
        }
      />
      {resetTarget && (
        <ResetPhaseModal
          quinielaId={id}
          quinielaStatus={quiniela.status}
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={() => {
            setResetTarget(null);
            invalidate();
          }}
        />
      )}
      {settleAutoMut.data && (
        <div className="mb-4 rounded-xl p-3 text-sm" style={{ background: 'rgba(124,255,91,0.1)', border: '1px solid rgba(124,255,91,0.3)', color: '#7CFF5B' }}>
          Evaluated {settleAutoMut.data.evaluated} · Settled {settleAutoMut.data.settled} · Pending {settleAutoMut.data.pending} · Skipped {settleAutoMut.data.skipped}
        </div>
      )}
      {activeJobs.length > 0 && (
        <div className="mb-4 rounded-xl p-3 text-sm flex items-center gap-3" style={{ background: 'rgba(124,196,255,0.1)', border: '1px solid rgba(124,196,255,0.3)', color: '#7CC4FF' }}>
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>
            {activeJobs.length} job{activeJobs.length > 1 ? 's' : ''} en curso ({activeJobs.map((j) => {
              const label = jobOperationLabel(j);
              const detail = jobProgressText(j);
              return detail ? `${label} (${detail})` : label;
            }).join(', ')}). Esta pantalla se refresca sola cada 15s.
          </span>
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
        {tab === 'phase1' && (
          <>
            <JobIssuesBanner job={latestJobByPhase(jobs, 'phase1')} quinielaId={id} phase="phase1" />
            <PicksTab picks={phase1Picks} quinielaId={id} />
          </>
        )}
        {tab === 'phase2' && (
          <>
            <JobIssuesBanner job={latestJobByPhase(jobs, 'phase2')} quinielaId={id} phase="phase2" />
            <PicksTab picks={phase2Picks} quinielaId={id} />
          </>
        )}
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

function latestJobByPhase(jobs: QuinielaJob[], phase: 'phase1' | 'phase2'): QuinielaJob | null {
  for (const j of jobs) {
    if (j.phase === phase) return j;
  }
  return null;
}

interface ParsedJobIssues {
  missingRequired: string[];
  omittedAllowed: string[];
  rejected: number;
  rejectedDetail: string | null;
}

function parseJobIssues(message: string | null): ParsedJobIssues | null {
  if (!message) return null;
  const parts = message.split('|').map((s) => s.trim());
  let missingRequired: string[] = [];
  let omittedAllowed: string[] = [];
  let rejected = 0;
  let rejectedDetail: string | null = null;
  for (const part of parts) {
    const missing = /^Missing required after retry:\s*(.+)$/i.exec(part);
    if (missing) {
      missingRequired = missing[1].split(',').map((s) => s.trim()).filter(Boolean);
      continue;
    }
    const omitted = /^Omitted \(allowed\):\s*(.+)$/i.exec(part);
    if (omitted) {
      omittedAllowed = omitted[1].split(',').map((s) => s.trim()).filter(Boolean);
      continue;
    }
    const rej = /^Rejected\s+(\d+)\s+picks:\s*(.+)$/i.exec(part);
    if (rej) {
      rejected = Number(rej[1]);
      rejectedDetail = rej[2];
    }
  }
  if (missingRequired.length === 0 && omittedAllowed.length === 0 && rejected === 0) return null;
  return { missingRequired, omittedAllowed, rejected, rejectedDetail };
}

function JobIssuesBanner({
  job,
  quinielaId,
  phase,
}: {
  job: QuinielaJob | null;
  quinielaId: string;
  phase: 'phase1' | 'phase2';
}) {
  const [showPayload, setShowPayload] = useState(false);
  if (!job) return null;
  const issues = parseJobIssues(job.errorMessage);
  if (!issues) return null;

  const tone = issues.missingRequired.length > 0 || issues.rejected > 0 ? 'danger' : 'warning';
  const bg = tone === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(255,176,46,0.08)';
  const border = tone === 'danger' ? 'rgba(239,68,68,0.3)' : 'rgba(255,176,46,0.3)';
  const color = tone === 'danger' ? '#FCA5A5' : '#FFB02E';

  return (
    <div className="mb-4 rounded-xl p-4 text-sm space-y-2" style={{ background: bg, border: `1px solid ${border}`, color }}>
      <div className="font-semibold uppercase tracking-wider text-xs">
        Job #{job.id} · {phase} · {job.model ?? '—'}
      </div>
      {issues.missingRequired.length > 0 && (
        <div>
          <span className="font-semibold">Categorías faltantes (incluso tras retry):</span>{' '}
          {issues.missingRequired.map((c) => (
            <span key={c} className="inline-block font-mono text-xs bg-black/30 rounded px-1.5 py-0.5 mr-1">{c}</span>
          ))}
          <p className="text-xs mt-1 opacity-80">
            Probables causas: payload sin <span className="font-mono">recentForm</span> /{' '}
            <span className="font-mono">preTournamentRanking</span> / <span className="font-mono">previousEditions</span>{' '}
            para estas categorías. Sembrá ranking o esperá data de matches antes de regenerar.
          </p>
        </div>
      )}
      {issues.omittedAllowed.length > 0 && (
        <div>
          <span className="font-semibold">Omitidas (permitido):</span>{' '}
          {issues.omittedAllowed.map((c) => (
            <span key={c} className="inline-block font-mono text-xs bg-black/30 rounded px-1.5 py-0.5 mr-1">{c}</span>
          ))}
        </div>
      )}
      {issues.rejected > 0 && (
        <div>
          <span className="font-semibold">Rechazadas:</span> {issues.rejected} pick(s).{' '}
          {issues.rejectedDetail && (
            <span className="font-mono text-xs opacity-80">{issues.rejectedDetail}</span>
          )}
        </div>
      )}
      <div className="pt-1">
        <button
          onClick={() => setShowPayload(true)}
          className="text-xs underline opacity-80 hover:opacity-100"
        >
          Ver payload enviado al LLM
        </button>
      </div>
      {showPayload && (
        <PayloadPreviewModal quinielaId={quinielaId} phase={phase} onClose={() => setShowPayload(false)} />
      )}
    </div>
  );
}

function PayloadPreviewModal({
  quinielaId,
  phase,
  onClose,
}: {
  quinielaId: string;
  phase: 'phase1' | 'phase2';
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quiniela-payload-preview', quinielaId, phase],
    queryFn: () => api.get<{ phase: string; payload: Record<string, unknown> }>(
      `/admin/quinielas/${quinielaId}/payload-preview?phase=${phase}`,
    ),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[80vh] rounded-2xl p-6 flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-text-primary font-sans">Payload preview · {phase}</h2>
          <Button onClick={onClose} variant="ghost" size="sm">Close</Button>
        </div>
        {isLoading && <p className="text-text-muted text-sm">Loading…</p>}
        {error && <p className="text-danger text-sm">{(error as Error).message}</p>}
        {data && (
          <pre className="flex-1 overflow-auto text-xs font-mono bg-black/30 rounded-xl p-3 text-text-secondary">
            {JSON.stringify(data.payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ResetPhaseModal({
  quinielaId,
  quinielaStatus,
  target,
  onClose,
  onSuccess,
}: {
  quinielaId: string;
  quinielaStatus: string;
  target: 'phase1' | 'phase2' | 'all';
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [wipeJobs, setWipeJobs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLocked =
    (target === 'phase2' && quinielaStatus === 'phase2_locked') ||
    ((target === 'phase1' || target === 'all') &&
      (quinielaStatus === 'phase1_locked' ||
        quinielaStatus === 'phase2_generated' ||
        quinielaStatus === 'phase2_locked'));
  const requiresForce = isLocked;

  const label =
    target === 'phase1'
      ? 'Phase 1'
      : target === 'phase2'
        ? 'Phase 2'
        : 'all phases';

  const consequence =
    target === 'phase1'
      ? 'Wipes Phase 1 picks (and Phase 2 if generated, since reasoning depends on Phase 1). State drops to draft.'
      : target === 'phase2'
        ? 'Wipes Phase 2 picks only. State drops to phase1_locked / phase1_generated.'
        : 'Wipes all picks and resets state to draft.';

  const resetMut = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams({ phase: target });
      if (requiresForce) params.set('force', 'true');
      if (wipeJobs) params.set('wipeJobs', 'true');
      return api.delete<{ status: string; picksDeleted: number; jobsDeleted: number }>(
        `/admin/quinielas/${quinielaId}/picks?${params.toString()}`,
      );
    },
    onSuccess,
    onError: (err: Error) => setError(err.message),
  });

  const canSubmit = confirmText === 'reset';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-danger font-sans">Reset {label}</h2>
        <p className="text-sm text-text-secondary">{consequence}</p>
        {requiresForce && (
          <p className="text-xs text-warning">
            Quiniela está en <span className="font-mono">{quinielaStatus}</span> — esto borra picks ya publicados.
          </p>
        )}

        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={wipeJobs}
            onChange={(e) => setWipeJobs(e.target.checked)}
            className="accent-danger"
          />
          También borrar el historial de LLM jobs (no recomendado — perdés trazabilidad)
        </label>

        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Escribí <span className="font-mono text-danger">reset</span> para confirmar
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary font-mono"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button
            onClick={() => resetMut.mutate()}
            variant="danger"
            disabled={!canSubmit}
            loading={resetMut.isPending}
          >
            Reset {label}
          </Button>
        </div>
      </div>
    </div>
  );
}

function jobOperationLabel(job: QuinielaJob): string {
  const op = job.operation ?? 'generate';
  if (op === 'generate') return job.phase ? `Generate ${job.phase}` : 'Generate';
  if (op === 'reset') return job.phase ? `Reset ${job.phase}` : 'Reset';
  if (op === 'sync_history') return 'Sync team history';
  return op;
}

function jobProgressText(job: QuinielaJob): string | null {
  // Sync-history progress is the only fan-out operation today. Show a compact
  // "X/Y teams (running R, retrying T, failed F)" so the admin can tell at a
  // glance whether the queue is moving and whether anything is stuck.
  if (job.operation !== 'sync_history' || !job.progress) return null;
  const p = job.progress;
  const parts: string[] = [`${p.completed}/${p.total} teams`];
  if (p.running > 0) parts.push(`running ${p.running}`);
  if (p.retrying > 0) parts.push(`retrying ${p.retrying}`);
  if (p.failed > 0) parts.push(`failed ${p.failed}`);
  return parts.join(' · ');
}

function jobDetailText(job: QuinielaJob): string | null {
  // The rightmost detail line varies by operation: generate exposes picks,
  // sync_history exposes aggregate team progress, reset exposes nothing.
  const op = job.operation ?? 'generate';
  if (op === 'generate') return `picks: ${job.picksGenerated}`;
  if (op === 'sync_history') return jobProgressText(job);
  return null;
}

function JobsTab({ jobs }: { jobs: QuinielaJob[] }) {
  if (jobs.length === 0) {
    return <p className="text-text-muted text-sm">No LLM jobs yet.</p>;
  }
  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const detail = jobDetailText(job);
        return (
          <div
            key={job.id}
            className="rounded-xl p-3 flex items-center justify-between"
            style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-mono text-text-muted">#{job.id}</span>
              <span className="text-sm text-text-primary font-sans">{jobOperationLabel(job)}</span>
              <StatusBadge status={job.status} />
              {detail && <span className="text-xs text-text-muted">{detail}</span>}
              {job.model && <span className="text-xs text-text-muted font-mono">{job.model}</span>}
            </div>
            <div className="text-xs text-text-muted">{formatDateTime(job.finishedAt ?? job.startedAt ?? job.createdAt)}</div>
          </div>
        );
      })}
    </div>
  );
}
