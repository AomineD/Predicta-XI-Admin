'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/ui/MetricCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime, formatPct } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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
    matchesProcessed: number;
    succeeded: number;
    failed: number;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
}

export default function DashboardPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/admin/dashboard'),
    refetchInterval: 30_000,
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Global Accuracy" value={formatPct(data?.globalAccuracy)} sub="All settled predictions" accent />
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

      {data?.lastJob && (
        <div className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 font-sans">
            Last Prediction Job
          </h2>
          <div className="flex items-center gap-4 flex-wrap">
            <StatusBadge status={data.lastJob.status} />
            <span className="text-text-muted text-sm font-sans">
              {data.lastJob.succeeded} ok · {data.lastJob.failed} failed · {data.lastJob.matchesProcessed} total
            </span>
            <span className="text-text-muted text-xs font-sans ml-auto">
              {formatDateTime(data.lastJob.startedAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
