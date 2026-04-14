'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/ui/MetricCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime, formatPct } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface LastSyncJob {
  id: number;
  type: string;
  status: string;
  synced: number;
  updated: number;
  errors: number;
  duration: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorLog: string | null;
}

interface DashboardMetrics {
  mostVisitedMatch: { prediction_id: string; visits: string; home: string; away: string; kickoff: string } | null;
  globalAccuracy: number | null;
  weeklyAccuracy: number | null;
  lastWeekAccuracy: number | null;
  pendingPredictions: number;
  activeUsers: number;
  creditsConsumedLast7Days: number;
  lastJob: {
    id: string;
    status: string;
    totalMatches: number;
    predicted: number;
    failed: number;
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
  lastSyncJob: LastSyncJob | null;
}

interface DashboardStats {
  scheduledMatches: number;
  finishedMatches: number;
  todayMatches: number;
  registeredUsers: number;
}

interface TopEntity {
  id: number;
  name: string;
  logo: string | null;
  accuracyPct: number;
  sampleSize: number;
  won: number;
}

interface CombinadasStat {
  pct: number | null;
  won: number;
  settled: number;
}

interface DashboardAdvancedKpis {
  topTeam: { allTime: TopEntity | null; last30Days: TopEntity | null };
  topLeague: { allTime: TopEntity | null; last30Days: TopEntity | null };
  combinadasAccuracyGlobal: CombinadasStat;
  combinadasAccuracyWeekly: CombinadasStat;
}

const SYNC_TYPE_LABELS: Record<string, string> = {
  match_sync: 'Match Sync',
  result_sync: 'Manual Result Sweep',
  enrichment: 'Enrichment',
  full_sync: 'Full Sync',
};

export default function DashboardPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/admin/dashboard'),
    refetchInterval: 30_000,
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/admin/dashboard/stats'),
    refetchInterval: 60_000,
  });

  const { data: kpis } = useQuery<DashboardAdvancedKpis>({
    queryKey: ['dashboard-kpis'],
    queryFn: () => api.get('/admin/dashboard/kpis'),
    // Heavier queries; refresh less often
    refetchInterval: 5 * 60_000,
  });

  const runJob = useMutation({
    mutationFn: () => api.post('/admin/predictions/run', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const chartData = [
    { label: 'Last week', value: data?.lastWeekAccuracy ?? 0 },
    { label: 'This week', value: data?.weeklyAccuracy ?? 0 },
    { label: 'All time',  value: data?.globalAccuracy ?? 0 },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="System overview — last 7 days"
        action={
          <Button
            variant="primary"
            loading={runJob.isPending}
            onClick={() => runJob.mutate()}
          >
            Run Prediction Job
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl p-4 flex flex-col" style={{ background: '#121A2B', border: '1px solid rgba(77,168,255,0.2)' }}>
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider font-sans mb-1">Scheduled</span>
          <span className="text-3xl font-bold text-text-primary font-sans">{stats?.scheduledMatches ?? '—'}</span>
          <span className="text-xs text-text-muted font-sans mt-1">Upcoming matches</span>
        </div>
        <div className="rounded-2xl p-4 flex flex-col" style={{ background: '#121A2B', border: '1px solid rgba(124,255,91,0.2)' }}>
          <span className="text-xs font-semibold text-success uppercase tracking-wider font-sans mb-1">Finished</span>
          <span className="text-3xl font-bold text-text-primary font-sans">{stats?.finishedMatches ?? '—'}</span>
          <span className="text-xs text-text-muted font-sans mt-1">Completed matches</span>
        </div>
        <div className="rounded-2xl p-4 flex flex-col" style={{ background: '#121A2B', border: '1px solid rgba(245,158,11,0.2)' }}>
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider font-sans mb-1">Today</span>
          <span className="text-3xl font-bold text-text-primary font-sans">{stats?.todayMatches ?? '—'}</span>
          <span className="text-xs text-text-muted font-sans mt-1">Matches today</span>
        </div>
        <div className="rounded-2xl p-4 flex flex-col" style={{ background: '#121A2B', border: '1px solid rgba(168,85,247,0.2)' }}>
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider font-sans mb-1">Users</span>
          <span className="text-3xl font-bold text-text-primary font-sans">{stats?.registeredUsers ?? '—'}</span>
          <span className="text-xs text-text-muted font-sans mt-1">Registered users</span>
        </div>
      </div>

      {/* Prediction metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Global Accuracy" value={formatPct(data?.globalAccuracy)} sub="Per-market accuracy" accent />
        <MetricCard label="Weekly Accuracy" value={formatPct(data?.weeklyAccuracy)} sub="This week" />
        <MetricCard label="Pending" value={isLoading ? '…' : data?.pendingPredictions} sub="Awaiting settlement" />
        <MetricCard label="Active Users" value={isLoading ? '…' : data?.activeUsers} sub="Last 7 days" />
        <MetricCard label="Credits Consumed" value={isLoading ? '…' : data?.creditsConsumedLast7Days} sub="Last 7 days" />
        {data?.mostVisitedMatch && (
          <MetricCard
            label="Most Visited"
            value={`${data.mostVisitedMatch.home} vs ${data.mostVisitedMatch.away}`}
            sub={`${data.mostVisitedMatch.visits} views`}
            className="col-span-2"
          />
        )}
      </div>

      {/* Advanced KPIs: top team, top league, combinadas accuracy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <TopEntityDualCard
          label="Top Team Accuracy"
          allTime={kpis?.topTeam.allTime}
          last30Days={kpis?.topTeam.last30Days}
        />
        <TopEntityDualCard
          label="Top League Accuracy"
          allTime={kpis?.topLeague.allTime}
          last30Days={kpis?.topLeague.last30Days}
        />
        <MetricCard
          label="Combinadas Accuracy (all-time)"
          value={
            kpis?.combinadasAccuracyGlobal.pct != null
              ? `${kpis.combinadasAccuracyGlobal.pct}%`
              : kpis
                ? '—'
                : '…'
          }
          sub={
            kpis
              ? `${kpis.combinadasAccuracyGlobal.won}/${kpis.combinadasAccuracyGlobal.settled} settled combinadas`
              : undefined
          }
          accent
        />
        <MetricCard
          label="Combinadas Accuracy (weekly)"
          value={
            kpis?.combinadasAccuracyWeekly.pct != null
              ? `${kpis.combinadasAccuracyWeekly.pct}%`
              : kpis
                ? '—'
                : '…'
          }
          sub={
            kpis
              ? `${kpis.combinadasAccuracyWeekly.won}/${kpis.combinadasAccuracyWeekly.settled} · last 7 days`
              : undefined
          }
        />
      </div>

      <div className="rounded-2xl p-5 mb-6" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4 font-sans">
          Accuracy Overview
        </h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} barSize={48}>
            <XAxis dataKey="label" tick={{ fill: '#98A2B3', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#98A2B3', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1F2A40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F5F7FB', fontSize: 12 }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              formatter={(v: unknown) => [`${v}%`, 'Accuracy']}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={i === 1 ? '#7CFF5B' : '#4DA8FF'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data?.lastJob && (
          <div className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 font-sans">
              Last Prediction Job
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
              <StatusBadge status={data.lastJob.status} />
              <span className="text-text-muted text-sm font-sans">
                {data.lastJob.predicted ?? 0} ok · {data.lastJob.failed ?? 0} failed · {data.lastJob.totalMatches ?? 0} total
              </span>
              <span className="text-text-muted text-xs font-sans ml-auto">
                {formatDateTime(data.lastJob.startedAt)}
              </span>
            </div>
          </div>
        )}

        {data?.lastSyncJob && (
          <div className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 font-sans">
              Last Sync Job
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
              <StatusBadge status={data.lastSyncJob.status} />
              <span className="text-xs px-2 py-0.5 rounded-md bg-surface-3 text-text-secondary font-sans">
                {SYNC_TYPE_LABELS[data.lastSyncJob.type] ?? data.lastSyncJob.type}
              </span>
              <span className="text-text-muted text-sm font-sans">
                {data.lastSyncJob.synced} new · {data.lastSyncJob.updated} updated · {data.lastSyncJob.errors} errors
              </span>
              <span className="text-text-muted text-xs font-sans ml-auto">
                {formatDateTime(data.lastSyncJob.startedAt)}
              </span>
            </div>
            {data.lastSyncJob.errorLog && (
              <p className="text-danger text-xs mt-2 truncate font-mono">{data.lastSyncJob.errorLog.slice(0, 120)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TopEntityDualCard({
  label,
  allTime,
  last30Days,
}: {
  label: string;
  allTime: TopEntity | null | undefined;
  last30Days: TopEntity | null | undefined;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <span className="text-xs font-medium text-text-muted uppercase tracking-wider font-sans">{label}</span>
      <div className="grid grid-cols-2 gap-4">
        <TopEntityRow title="All-time" entity={allTime} />
        <TopEntityRow title="Last 30 days" entity={last30Days} />
      </div>
    </div>
  );
}

function TopEntityRow({ title, entity }: { title: string; entity: TopEntity | null | undefined }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider font-sans">{title}</span>
      {entity === undefined ? (
        <span className="text-text-muted text-sm font-sans">…</span>
      ) : entity === null ? (
        <span className="text-text-muted text-sm font-sans">Not enough data</span>
      ) : (
        <div className="flex items-center gap-3">
          {entity.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entity.logo}
              alt={entity.name}
              className="w-10 h-10 rounded-md object-contain bg-surface-2 p-1 flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-md bg-surface-2 flex-shrink-0" />
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-text-primary text-sm font-medium font-sans truncate">{entity.name}</span>
            <span className="text-xs font-sans">
              <span className="text-primary font-semibold">{entity.accuracyPct}%</span>
              <span className="text-text-muted"> · {entity.sampleSize} markets</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
