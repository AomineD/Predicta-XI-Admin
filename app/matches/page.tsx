'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';

interface Match {
  id: number;
  homeTeam: { name: string; logo?: string } | null;
  awayTeam: { name: string; logo?: string } | null;
  kickoff: string | null;
  status: string;
  score: { home: number; away: number } | null;
  predicted: boolean;
  competitionName?: string;
}

interface MatchesResponse {
  items: Match[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_OPTIONS = ['', 'NS', 'FT', 'LIVE', 'PST', 'CANC'];

export default function MatchesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery<MatchesResponse>({
    queryKey: ['matches', page, status],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status) params.set('status', status);
      return api.get(`/admin/matches?${params}`);
    },
  });

  const columns: Column<Match>[] = [
    {
      key: 'match',
      header: 'Match',
      render: (row) => (
        <span className="font-medium text-text-primary">
          {row.homeTeam?.name ?? '?'} vs {row.awayTeam?.name ?? '?'}
        </span>
      ),
    },
    {
      key: 'competition',
      header: 'Competition',
      render: (row) => <span className="text-text-muted text-xs">{row.competitionName ?? '—'}</span>,
    },
    {
      key: 'kickoff',
      header: 'Kickoff',
      render: (row) => <span className="text-text-secondary text-xs">{formatDateTime(row.kickoff)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'score',
      header: 'Score',
      render: (row) =>
        row.score != null ? (
          <span className="font-semibold text-text-primary">{row.score.home} — {row.score.away}</span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: 'predicted',
      header: 'Predicted',
      render: (row) => (
        <span className={row.predicted ? 'text-success text-xs' : 'text-text-muted text-xs'}>
          {row.predicted ? 'Yes' : 'No'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Matches" description="All matches in the database" />

      <div className="flex items-center gap-3 mb-4">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-2 border border-border outline-none"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        keyExtractor={(r) => r.id}
        loading={isLoading}
        emptyMessage="No matches found"
      />

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-text-muted text-sm font-sans">Page {page} · {data.total} total</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * data.pageSize >= data.total}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
