'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw, History, Flag, Newspaper, RefreshCw, Gavel, CalendarClock, Trash2,
  Wand2, ImageIcon, type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MetricCard } from '@/components/ui/MetricCard';
import { Tabs } from '@/components/ui/Tabs';
import { ActionMenu, type ActionMenuSection } from '@/components/ui/ActionMenu';
import { formatDateTime } from '@/lib/utils';
import { TeamNewsManager } from '@/components/team-news/TeamNewsManager';
import {
  categoryLabel, categoryIcon, formatPickValue, confidenceTone, MANUAL_ONLY_CATEGORIES,
} from '@/lib/quiniela-picks';

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
  teamLogoUrl?: string | null;
  playerAvatarUrl?: string | null;
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
  operation?: 'generate' | 'reset' | 'sync_history' | 'sync_team_news' | 'settle';
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
    phase1SettlementAt: string | null;
    phase2SettlementAt: string | null;
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
  { id: 'overview',   label: 'Overview' },
  { id: 'picks',      label: 'Picks' },
  { id: 'settlement', label: 'Settlement' },
  { id: 'jobs',       label: 'Jobs' },
];

export default function QuinielaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<string>('overview');
  const [picksPhase, setPicksPhase] = useState<'phase1' | 'phase2'>('phase1');
  const [resetTarget, setResetTarget] = useState<'phase1' | 'phase2' | 'all' | null>(null);
  const [newsPickerOpen, setNewsPickerOpen] = useState(false);
  const [newsTeam, setNewsTeam] = useState<{ id: number; name: string } | null>(null);
  const [editSchedule, setEditSchedule] = useState(false);
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

  // Re-sync guard: if the last sync_history job finished < 30 min ago and the
  // current team_history_sync_jobs are all completed, ask the admin to confirm
  // before re-running (scraping all teams is slow and rate-limited).
  const triggerSyncHistory = () => {
    const latestSync = (data?.jobs ?? [])
      .filter((j) => j.operation === 'sync_history' && j.status === 'completed' && j.finishedAt)
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0];
    if (latestSync?.finishedAt) {
      const ageMs = Date.now() - new Date(latestSync.finishedAt).getTime();
      const allTeamsCompleted = latestSync.progress
        ? latestSync.progress.completed > 0 && latestSync.progress.completed === latestSync.progress.total
        : false;
      if (ageMs < 30 * 60_000 && allTeamsCompleted) {
        const minutes = Math.max(1, Math.round(ageMs / 60_000));
        const ok = window.confirm(
          `Ya hay datos recientes: la última sincronización terminó hace ${minutes} min con ${latestSync.progress?.completed}/${latestSync.progress?.total} equipos.\n\n¿Forzar re-sync de todos los equipos?`,
        );
        if (!ok) return;
      }
    }
    syncHistoryMut.mutate();
  };

  // Fire-and-forget settlement: enqueues a `settle` quiniela_job (returns
  // {jobId, status:'pending'}); the dispatcher runs the evaluators with
  // respectSchedule:false. Progress surfaces via the active-jobs banner + 15s
  // polling, same as Generate.
  const settleNowMut = useMutation<{ jobId: number; status: string }, Error, void>({
    mutationFn: () => api.post(`/admin/quinielas/${id}/settle-now`),
    onSuccess: invalidate,
  });

  // Sync FIFA Men's World Ranking → competition_pre_tournament_ranking.
  // The backend hits FIFA's public API, intersects with qualified teams in
  // competition_standings, and stores a dense 1..N ranking. Required before
  // Generate Phase 1 (assertMinDataCoverage blocks otherwise).
  const syncFifaRankingMut = useMutation<
    {
      inserted: number;
      unmatchedFromFifa: string[];
      qualifiedNotFoundInFifa: string[];
      scheduleIdUsed: string;
    },
    Error,
    void
  >({
    mutationFn: () => {
      const compId = data?.quiniela.competitionId;
      const seasonYear = data?.quiniela.seasonYear;
      if (!compId || !seasonYear) {
        return Promise.reject(new Error('Missing competitionId or seasonYear'));
      }
      return api.post(
        `/admin/competitions/${compId}/sync-fifa-ranking?seasonYear=${encodeURIComponent(seasonYear)}`,
      );
    },
    onSuccess: invalidate,
  });

  // Bulk team-news sync: enqueues a `sync_team_news` quiniela_job. Returns
  // {jobId, status: 'pending'} immediately; the scheduler picks it up in
  // the background and writes progress to the row's error_message which
  // the active-jobs banner picks up at the 15s polling cadence.
  const syncTeamNewsMut = useMutation<{ jobId: number; status: string }, Error, void>({
    mutationFn: () => api.post(`/admin/quinielas/${id}/sync-team-news`),
    onSuccess: invalidate,
  });

  // Fire-and-forget: enqueues a `sync_avatars` quiniela_job that resolves the
  // picked players' Flashscore slugs and scrapes their headshots into
  // player_avatars. Result surfaces via the 15s polling once the job finishes.
  const syncAvatarsMut = useMutation<{ jobId: number; status: string }, Error, void>({
    mutationFn: () => api.post(`/admin/quinielas/${id}/sync-player-avatars`),
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return <p className="text-text-muted">Loading…</p>;
  }

  const { quiniela, picks, jobs, paidUsersCount } = data;
  const settledPicks = picks.filter((p) => p.settlement !== 'pending' && p.settlement !== 'void').length;
  const phase1Picks = picks.filter((p) => p.phase === 'phase1');
  const phase2Picks = picks.filter((p) => p.phase === 'phase2');

  const canGeneratePhase1 = quiniela.status === 'draft';
  const canRegeneratePhase1 = quiniela.status === 'phase1_generated';
  const canGeneratePhase2 = quiniela.status === 'phase1_locked';
  const canRegeneratePhase2 = quiniela.status === 'phase2_generated';
  const canSettleAuto = quiniela.status === 'phase1_locked'
    || quiniela.status === 'phase2_generated'
    || quiniela.status === 'phase2_locked';
  // When nothing else is the lifecycle CTA (phase2_locked), settlement becomes
  // the header's primary action; otherwise it lives in the Acciones menu.
  const settleIsPrimary = quiniela.status === 'phase2_locked';
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
    (syncFifaRankingMut.error as Error | undefined)?.message ??
    (settleNowMut.error as Error | undefined)?.message ??
    null;

  // Build the secondary-action menu. Items use `hidden` so empty sections are
  // dropped by ActionMenu.
  const menuSections: ActionMenuSection[] = [
    {
      label: 'Lifecycle',
      items: [
        { label: 'Regenerate Phase 1', icon: RotateCcw, onClick: () => generatePhase1Mut.mutate(true), hidden: !canRegeneratePhase1 },
        { label: 'Regenerate Phase 2', icon: RotateCcw, onClick: () => generatePhase2Mut.mutate(true), hidden: !canRegeneratePhase2 },
      ],
    },
    {
      label: 'Data & sync',
      items: [
        { label: 'Sync team history', icon: History, onClick: triggerSyncHistory },
        { label: 'Sync FIFA ranking', icon: Flag, onClick: () => syncFifaRankingMut.mutate() },
        { label: 'Team news…', icon: Newspaper, onClick: () => setNewsPickerOpen(true) },
        { label: 'Sync news (all teams)', icon: RefreshCw, onClick: () => syncTeamNewsMut.mutate() },
        { label: 'Sync player avatars', icon: ImageIcon, onClick: () => syncAvatarsMut.mutate() },
      ],
    },
    {
      label: 'Settlement',
      items: [
        { label: 'Run settlement now', icon: Gavel, onClick: () => settleNowMut.mutate(), hidden: !canSettleAuto || settleIsPrimary },
        { label: 'Edit schedule…', icon: CalendarClock, onClick: () => setEditSchedule(true) },
      ],
    },
    {
      label: 'Danger',
      items: [
        { label: 'Reset Phase 1', icon: Trash2, danger: true, onClick: () => setResetTarget('phase1'), hidden: !canResetPhase1 },
        { label: 'Reset Phase 2', icon: Trash2, danger: true, onClick: () => setResetTarget('phase2'), hidden: !canResetPhase2 },
        { label: 'Reset all', icon: Trash2, danger: true, onClick: () => setResetTarget('all'), hidden: !(canResetPhase1 && canResetPhase2) },
      ],
    },
  ];

  // Single contextual primary action for the header (advance the lifecycle).
  let primaryCta: React.ReactNode = null;
  if (canGeneratePhase1) {
    primaryCta = <Button variant="primary" loading={generatePhase1Mut.isPending} onClick={() => generatePhase1Mut.mutate(false)}>Generate Phase 1</Button>;
  } else if (quiniela.status === 'phase1_generated') {
    primaryCta = <Button variant="primary" loading={lockMut.isPending} onClick={() => lockMut.mutate()}>Publish Phase 1</Button>;
  } else if (canGeneratePhase2) {
    primaryCta = <Button variant="primary" loading={generatePhase2Mut.isPending} onClick={() => generatePhase2Mut.mutate(false)}>Generate Phase 2</Button>;
  } else if (quiniela.status === 'phase2_generated') {
    primaryCta = <Button variant="primary" loading={lockMut.isPending} onClick={() => lockMut.mutate()}>Publish Phase 2</Button>;
  } else if (settleIsPrimary) {
    primaryCta = <Button variant="primary" loading={settleNowMut.isPending} onClick={() => settleNowMut.mutate()}>Run settlement now</Button>;
  }

  return (
    <>
      <PageHeader
        title={quiniela.name}
        description={`${quiniela.seasonYear} · Tournament: ${formatDateTime(quiniela.tournamentStartsAt)}${quiniela.tournamentEndsAt ? ` → ${formatDateTime(quiniela.tournamentEndsAt)}` : ''}`}
        action={
          <div className="flex items-center gap-2 justify-end">
            <StatusBadge status={quiniela.status} />
            {primaryCta}
            <ActionMenu sections={menuSections} />
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
      {newsPickerOpen && (
        <TeamNewsPickerModal
          competitionId={quiniela.competitionId}
          seasonYear={quiniela.seasonYear}
          onClose={() => setNewsPickerOpen(false)}
          onSelect={(team) => {
            setNewsPickerOpen(false);
            setNewsTeam(team);
          }}
        />
      )}
      {newsTeam && (
        <TeamNewsManager
          teamId={newsTeam.id}
          teamName={newsTeam.name}
          onClose={() => setNewsTeam(null)}
        />
      )}
      {editSchedule && (
        <SettlementScheduleModal
          quinielaId={id}
          phase1SettlementAt={quiniela.phase1SettlementAt}
          phase2SettlementAt={quiniela.phase2SettlementAt}
          onClose={() => setEditSchedule(false)}
        />
      )}
      {syncFifaRankingMut.data && (
        <div
          className="mb-4 rounded-xl p-3 text-sm"
          style={{
            background: 'rgba(124,255,91,0.1)',
            border: '1px solid rgba(124,255,91,0.3)',
            color: '#7CFF5B',
          }}
        >
          FIFA ranking saved: {syncFifaRankingMut.data.inserted} teams ranked.
          {syncFifaRankingMut.data.qualifiedNotFoundInFifa.length > 0 && (
            <span style={{ color: '#FFD27A' }}>
              {' · Qualified but missing in FIFA list: '}
              {syncFifaRankingMut.data.qualifiedNotFoundInFifa.join(', ')}
            </span>
          )}
          {syncFifaRankingMut.data.unmatchedFromFifa.length > 0 && (
            <span style={{ color: '#FFD27A' }}>
              {' · FIFA names with no DB match: '}
              {syncFifaRankingMut.data.unmatchedFromFifa.join(', ')}
            </span>
          )}
        </div>
      )}
      {syncTeamNewsMut.error && (
        <div
          className="mb-4 rounded-xl p-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}
        >
          Team news enqueue failed: {(syncTeamNewsMut.error as Error).message}
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
        {tab === 'overview' && <OverviewTab quiniela={quiniela} jobs={jobs} settledPicks={settledPicks} totalPicks={picks.length} />}
        {tab === 'picks' && (
          <PicksSection
            phase1Picks={phase1Picks}
            phase2Picks={phase2Picks}
            jobs={jobs}
            quinielaId={id}
            phase={picksPhase}
            onPhaseChange={setPicksPhase}
          />
        )}
        {tab === 'settlement' && (
          <SettlementTab
            quiniela={quiniela}
            picks={picks}
            quinielaId={id}
            canSettleAuto={canSettleAuto}
            onRunNow={() => settleNowMut.mutate()}
            runningNow={settleNowMut.isPending}
            onEditSchedule={() => setEditSchedule(true)}
          />
        )}
        {tab === 'jobs' && <JobsTab jobs={jobs} />}
      </div>
    </>
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-6 space-y-3 ${className ?? ''}`}
      style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {children}
    </div>
  );
}

function lastCompletedJob(jobs: QuinielaJob[], operation: QuinielaJob['operation']): QuinielaJob | null {
  return (
    jobs
      .filter((j) => j.operation === operation && j.status === 'completed')
      .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0] ?? null
  );
}

function OverviewTab({
  quiniela,
  jobs,
  settledPicks,
  totalPicks,
}: {
  quiniela: QuinielaDetail['quiniela'];
  jobs: QuinielaJob[];
  settledPicks: number;
  totalPicks: number;
}) {
  const lastHistory = lastCompletedJob(jobs, 'sync_history');
  const lastNews = lastCompletedJob(jobs, 'sync_team_news');

  return (
    <div className="space-y-4">
      <SectionCard>
        <Row label="Status" value={<StatusBadge status={quiniela.status} />} />
        <Row label="Competition ID" value={String(quiniela.competitionId)} />
        <Row label="Season year" value={quiniela.seasonYear} />
        <Row label="Tournament starts" value={formatDateTime(quiniela.tournamentStartsAt)} />
        <Row label="Tournament ends" value={formatDateTime(quiniela.tournamentEndsAt)} />
        <Row label="Created at" value={formatDateTime(quiniela.createdAt)} />
        <Row label="Credits charged (snapshot)" value={String(quiniela.creditsCharged)} />
      </SectionCard>

      <SectionCard>
        <h3 className="text-sm font-bold text-text-primary font-sans">Data readiness</h3>
        <p className="text-xs text-text-muted font-sans mt-0.5">
          Generation needs recent form, FIFA ranking and team news. Sync these from the Acciones menu before generating.
        </p>
        <Row label="Phase 1 generated" value={formatDateTime(quiniela.phase1GeneratedAt)} />
        <Row label="Phase 2 generated" value={formatDateTime(quiniela.phase2GeneratedAt)} />
        <Row label="Last team-history sync" value={lastHistory ? formatDateTime(lastHistory.finishedAt) : '—'} />
        <Row label="Last team-news sync" value={lastNews ? formatDateTime(lastNews.finishedAt) : '—'} />
      </SectionCard>

      <SectionCard>
        <div>
          <h3 className="text-sm font-bold text-text-primary font-sans">Settlement</h3>
          <p className="text-xs text-text-muted font-sans mt-0.5">
            Run, schedule and resolve manual awards from the Settlement tab.
          </p>
        </div>
        <Row label="Settled picks" value={`${settledPicks}/${totalPicks}`} />
        <Row label="Settled at" value={formatDateTime(quiniela.settledAt)} />
        <Row label="Phase 1 schedule" value={<SettlementValue iso={quiniela.phase1SettlementAt} />} />
        <Row label="Phase 2 schedule" value={<SettlementValue iso={quiniela.phase2SettlementAt} />} />
      </SectionCard>
    </div>
  );
}

function PicksSection({
  phase1Picks,
  phase2Picks,
  jobs,
  quinielaId,
  phase,
  onPhaseChange,
}: {
  phase1Picks: QuinielaPick[];
  phase2Picks: QuinielaPick[];
  jobs: QuinielaJob[];
  quinielaId: string;
  phase: 'phase1' | 'phase2';
  onPhaseChange: (p: 'phase1' | 'phase2') => void;
}) {
  const picks = phase === 'phase1' ? phase1Picks : phase2Picks;
  const toggle = (p: 'phase1' | 'phase2', label: string, count: number) => (
    <button
      type="button"
      onClick={() => onPhaseChange(p)}
      className={`px-4 h-9 rounded-xl text-xs font-sans font-medium transition-colors ${
        phase === p ? 'bg-surface-3 text-text-primary' : 'text-text-muted hover:text-text-primary hover:bg-surface-3/50'
      }`}
    >
      {label} <span className="font-mono opacity-70">({count})</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div
        className="inline-flex items-center gap-1 rounded-2xl p-1"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {toggle('phase1', 'Phase 1', phase1Picks.length)}
        {toggle('phase2', 'Phase 2', phase2Picks.length)}
      </div>
      <JobIssuesBanner job={latestJobByPhase(jobs, phase)} quinielaId={quinielaId} phase={phase} />
      <PicksTab picks={picks} quinielaId={quinielaId} />
    </div>
  );
}

function SettlementTab({
  quiniela,
  picks,
  quinielaId,
  canSettleAuto,
  onRunNow,
  runningNow,
  onEditSchedule,
}: {
  quiniela: QuinielaDetail['quiniela'];
  picks: QuinielaPick[];
  quinielaId: string;
  canSettleAuto: boolean;
  onRunNow: () => void;
  runningNow: boolean;
  onEditSchedule: () => void;
}) {
  const awardPicks = picks.filter((p) => MANUAL_ONLY_CATEGORIES.has(p.category));
  const manualPending = awardPicks.filter((p) => p.settlement === 'pending');

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-text-primary font-sans">Run settlement now</h3>
            <p className="text-xs text-text-muted font-sans mt-0.5 max-w-xl leading-snug">
              Evaluates every pick with real results available, ignoring the schedule. Runs in the background
              (fire-and-forget) — watch the active-job banner and the Jobs tab for the outcome.
            </p>
          </div>
          <Button variant="primary" onClick={onRunNow} loading={runningNow} disabled={!canSettleAuto}>
            <Gavel size={15} /> Run now
          </Button>
        </div>
        {!canSettleAuto && (
          <p className="text-xs text-warning font-sans">Settlement becomes available once Phase 1 is published.</p>
        )}
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-primary font-sans">Scheduled settlement</h3>
            <p className="text-xs text-text-muted font-sans mt-0.5">
              When the scheduler auto-settles each phase. Empty = manual only.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={onEditSchedule}>
            Edit schedule
          </Button>
        </div>
        <Row label="Phase 1 settlement" value={<SettlementValue iso={quiniela.phase1SettlementAt} />} />
        <Row label="Phase 2 settlement" value={<SettlementValue iso={quiniela.phase2SettlementAt} />} />
      </SectionCard>

      <SectionCard>
        <div>
          <h3 className="text-sm font-bold text-text-primary font-sans">
            Awards awaiting manual settlement
            {manualPending.length > 0 && (
              <span className="ml-2 text-xs font-mono text-warning">{manualPending.length}</span>
            )}
          </h3>
          <p className="text-xs text-text-muted font-sans mt-0.5">
            Subjective awards (MVP, best young player, best goalkeeper) have no data source — settle them by hand
            once officially announced.
          </p>
        </div>
        {manualPending.length === 0 ? (
          <p className="text-sm text-text-muted font-sans">
            {awardPicks.length === 0 ? 'No award picks in this quiniela.' : 'All awards settled.'}
          </p>
        ) : (
          <div className="space-y-3">
            {manualPending.map((p) => (
              <div key={p.id}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1 font-sans">
                  {categoryLabel(p.category)}
                </div>
                <PickRow pick={p} quinielaId={quinielaId} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/**
 * Renders a settlement timestamp with a colored hint: green once the scheduled
 * time has passed (phase is being settled), amber while still in the future
 * (scheduled), muted dash when unset (manual-only).
 */
function SettlementValue({ iso }: { iso: string | null }) {
  // Snapshot the clock once via a lazy initializer (runs a single time, not on
  // every render) so the active/scheduled tint stays stable and pure.
  const [nowMs] = useState(() => Date.now());

  if (!iso) return <span className="text-text-muted">— (manual only)</span>;
  const due = new Date(iso).getTime() <= nowMs;
  return (
    <span style={{ color: due ? '#7CFF5B' : '#FFD27A' }}>
      {formatDateTime(iso)} {due ? '· active' : '· scheduled'}
    </span>
  );
}

/**
 * datetime-local needs `YYYY-MM-DDTHH:mm` in LOCAL time. Convert an ISO/UTC
 * string into that shape so the picker pre-fills the stored value correctly.
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SettlementScheduleModal({
  quinielaId,
  phase1SettlementAt,
  phase2SettlementAt,
  onClose,
}: {
  quinielaId: string;
  phase1SettlementAt: string | null;
  phase2SettlementAt: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [phase1, setPhase1] = useState(isoToLocalInput(phase1SettlementAt));
  const [phase2, setPhase2] = useState(isoToLocalInput(phase2SettlementAt));
  const [error, setError] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: () =>
      api.patch(`/admin/quinielas/${quinielaId}`, {
        // Empty input clears the schedule (null); a value sets it. We always
        // send both so clearing a previously-set date persists.
        phase1SettlementAt: phase1 ? new Date(phase1).toISOString() : null,
        phase2SettlementAt: phase2 ? new Date(phase2).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiniela-detail', quinielaId] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold text-text-primary font-sans">Settlement schedule</h2>
          <p className="text-xs text-text-muted font-sans mt-1 leading-snug">
            Pick when the scheduler may start auto-settling each phase. Set Phase 1 for after the group
            stage, Phase 2 for after the final. Picks still only score once real results are in. Clear a
            field to switch that phase back to manual-only.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Phase 1 settlement
          </label>
          <input
            type="datetime-local"
            value={phase1}
            onChange={(e) => setPhase1(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Phase 2 settlement
          </label>
          <input
            type="datetime-local"
            value={phase2}
            onChange={(e) => setPhase2(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-between gap-2 pt-2">
          <Button
            onClick={() => { setPhase1(''); setPhase2(''); }}
            variant="ghost"
          >
            Clear both
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="ghost">Cancel</Button>
            <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} variant="primary">
              Save
            </Button>
          </div>
        </div>
      </div>
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
      {Object.entries(grouped).map(([category, items]) => {
        const Icon = categoryIcon(category);
        return (
          <div key={category}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary uppercase tracking-wider mb-2 font-sans">
              <Icon size={15} className="text-text-muted" />
              {categoryLabel(category)}
            </h3>
            <div className="space-y-2">
              {items.map((pick) => (
                <PickRow key={pick.id} pick={pick} quinielaId={quinielaId} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PickRow({ pick, quinielaId }: { pick: QuinielaPick; quinielaId: string }) {
  const queryClient = useQueryClient();
  const [showSettleManual, setShowSettleManual] = useState(false);

  const isManualOnly = MANUAL_ONLY_CATEGORIES.has(pick.category);
  const display = formatPickValue(pick.category, pick.value, pick.subjectKey);
  const tone = confidenceTone(pick.confidence);
  const toneColor = tone === 'high' ? '#7CFF5B' : tone === 'medium' ? '#FFB02E' : '#FCA5A5';

  // Player picks favour the headshot; otherwise show the team crest. The
  // avatar is round (player), the crest is square-ish (logo). Both come from
  // Flashscore and may be absent (no thumbnail rendered then).
  const isPlayerCategory = !!pick.playerAvatarUrl;
  const thumbUrl = pick.playerAvatarUrl ?? pick.teamLogoUrl ?? null;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between gap-4">
        {thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt=""
            width={40}
            height={40}
            className={`shrink-0 object-contain bg-black/20 ${isPlayerCategory ? 'rounded-full object-cover' : 'rounded-md p-0.5'}`}
            style={{ width: 40, height: 40 }}
          />
        )}
        <div className="flex-1 min-w-0">
          {pick.subjectKey && pick.category !== 'group_standings' && (
            <div className="text-[11px] text-text-muted font-mono mb-0.5">{pick.subjectKey}</div>
          )}
          <div className="text-sm text-text-primary font-sans font-medium">{display.primary}</div>
          {display.secondary && (
            <div className="text-xs text-text-secondary font-sans mt-0.5">{display.secondary}</div>
          )}
          {pick.reasoning && (
            <p className="text-xs text-text-secondary mt-2 italic">{pick.reasoning}</p>
          )}
          <details className="mt-2 group">
            <summary className="text-[11px] text-text-muted cursor-pointer hover:text-text-secondary font-sans select-none list-none">
              View raw JSON
            </summary>
            <pre className="font-mono text-[11px] whitespace-pre-wrap mt-1 bg-black/30 rounded-lg p-2 text-text-secondary">
              {JSON.stringify(pick.value, null, 2)}
            </pre>
          </details>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusBadge status={pick.settlement} />
          <span className="text-xs font-mono font-semibold" style={{ color: toneColor }}>
            {pick.confidence}%
          </span>
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
  if (op === 'sync_team_news') return 'Sync team news';
  if (op === 'settle') return 'Settle';
  return op;
}

function jobProgressText(job: QuinielaJob): string | null {
  // Sync-history progress: aggregate counts from team_history_sync_jobs.
  if (job.operation === 'sync_history' && job.progress) {
    const p = job.progress;
    const parts: string[] = [`${p.completed}/${p.total} teams`];
    if (p.running > 0) parts.push(`running ${p.running}`);
    if (p.retrying > 0) parts.push(`retrying ${p.retrying}`);
    if (p.failed > 0) parts.push(`failed ${p.failed}`);
    return parts.join(' · ');
  }
  // Sync-team-news progress: scheduler writes a human-readable status line
  // into error_message every 5 teams. We surface it verbatim while running;
  // completed jobs show the final summary. Truncated to keep the banner
  // compact.
  if (job.operation === 'sync_team_news' && job.errorMessage) {
    const m = job.errorMessage.match(/teams.*?inserted=\d+\)?|teams synced, \d+ new news inserted/i);
    if (m) return m[0].slice(0, 80);
    return job.errorMessage.slice(0, 80);
  }
  return null;
}

function jobDetailText(job: QuinielaJob): string | null {
  // The rightmost detail line varies by operation: generate exposes picks,
  // sync_history exposes aggregate team progress, sync_team_news shows the
  // running progress message or final summary, reset exposes nothing.
  const op = job.operation ?? 'generate';
  if (op === 'generate') return `picks: ${job.picksGenerated}`;
  if (op === 'sync_history') return jobProgressText(job);
  if (op === 'sync_team_news') return jobProgressText(job);
  if (op === 'settle') return job.errorMessage;
  return null;
}

function jobOperationIcon(job: QuinielaJob): LucideIcon {
  switch (job.operation ?? 'generate') {
    case 'generate': return Wand2;
    case 'reset': return RotateCcw;
    case 'sync_history': return History;
    case 'sync_team_news': return Newspaper;
    case 'settle': return Gavel;
    default: return Wand2;
  }
}

function JobsTab({ jobs }: { jobs: QuinielaJob[] }) {
  if (jobs.length === 0) {
    return <p className="text-text-muted text-sm font-sans">No jobs yet.</p>;
  }
  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const detail = jobDetailText(job);
        const Icon = jobOperationIcon(job);
        // For ops where `error_message` carries useful operator info
        // (sync_team_news funnel, sync_history aggregate counters, reset
        // summaries) show the full text behind a Details toggle. `generate`
        // errors render via JobIssuesBanner so we don't double-render; `settle`
        // already surfaces its summary as the inline detail.
        const showFullMessage = !!job.errorMessage
          && job.operation !== 'generate'
          && job.errorMessage !== detail;
        return (
          <div
            key={job.id}
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-surface-3 text-text-secondary">
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-text-primary font-sans">{jobOperationLabel(job)}</span>
                    <StatusBadge status={job.status} />
                    <span className="text-[11px] font-mono text-text-muted">#{job.id}</span>
                    {job.model && <span className="text-[11px] text-text-muted font-mono">{job.model}</span>}
                  </div>
                  {detail && <div className="text-xs text-text-muted font-sans mt-0.5 truncate">{detail}</div>}
                </div>
              </div>
              <div className="text-xs text-text-muted shrink-0 font-sans">
                {formatDateTime(job.finishedAt ?? job.startedAt ?? job.createdAt)}
              </div>
            </div>
            {showFullMessage && (
              <details>
                <summary className="text-[11px] text-text-muted cursor-pointer hover:text-text-secondary font-sans select-none">
                  Details
                </summary>
                <pre className="text-[11px] font-mono whitespace-pre-wrap break-words bg-black/30 rounded-lg p-2 text-text-secondary mt-1">
                  {job.errorMessage}
                </pre>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PickerTeam {
  id: number;
  name: string;
  shortName: string;
  logo: string | null;
  country: string | null;
}

interface PickerTeamsResponse {
  items: PickerTeam[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Modal lightweight para buscar y seleccionar un equipo nacional al cual
 * inyectar noticias. Cuando el admin elige uno, devuelve el {id, name}
 * vía onSelect — el padre se encarga de abrir el TeamNewsManager.
 *
 * Filtramos teamType=national por defecto: en quinielas WC todos los
 * equipos relevantes son selecciones. Si en el futuro hay quinielas de
 * clubes, removemos el filtro.
 *
 * No usamos competitionId/seasonYear todavía porque /admin/teams no
 * soporta filtrar por "qualified to competition X" — los props quedan
 * para una futura iteración donde el backend exponga ese listado.
 */
function TeamNewsPickerModal({
  onClose,
  onSelect,
}: {
  competitionId: number;
  seasonYear: string;
  onClose: () => void;
  onSelect: (team: { id: number; name: string }) => void;
}) {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<PickerTeamsResponse>({
    queryKey: ['teams-picker', search],
    queryFn: () => {
      const qp = new URLSearchParams({ page: '1', pageSize: '30', teamType: 'national' });
      if (search.trim()) qp.set('search', search.trim());
      return api.get(`/admin/teams?${qp.toString()}`);
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] rounded-2xl flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div>
            <h2 className="text-base font-bold text-text-primary font-sans">📰 Pick a team to inject news</h2>
            <p className="text-xs text-text-muted font-sans">
              Searching across all national teams. Pick one and add injury/suspension notes.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="px-5 pt-4">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type to search teams…"
            className="w-full h-10 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading && <p className="text-text-muted text-sm font-sans">Loading…</p>}
          {!isLoading && (data?.items ?? []).length === 0 && (
            <p className="text-text-muted text-sm font-sans">No national teams match.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(data?.items ?? []).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect({ id: t.id, name: t.name })}
                className="rounded-xl p-3 flex items-center gap-3 text-left transition-colors hover:border-primary/40 cursor-pointer"
                style={{ background: '#0E1626', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {t.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.logo}
                    alt={t.name}
                    className="w-8 h-8 object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-text-muted font-sans">
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary font-sans truncate">{t.name}</p>
                  <p className="text-[10px] text-text-muted font-sans truncate">{t.country ?? t.shortName}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
