'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';

interface Prediction {
  id: string;
  matchId: number;
  model: string;
  coverageScore: number | null;
  settlement: string;
  settledMarkets: number | null;
  wonMarkets: number | null;
  createdAt: string | null;
  homeTeam?: string;
  awayTeam?: string;
}

interface PredictionsResponse {
  items: Prediction[];
  total: number;
  page: number;
  pageSize: number;
}

const SETTLEMENT_OPTIONS = ['', 'won', 'lost', 'partial', 'pending', 'void'];

export default function PredictionsPage() {
  const [page, setPage] = useState(1);
  const [settlement, setSettlement] = useState('');

  const { data, isLoading } = useQuery<PredictionsResponse>({
    queryKey: ['predictions', page, settlement],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (settlement) params.set('settlement', settlement);
      return api.get(`/admin/predictions?${params}`);
    },
  });

  const columns: Column<Prediction>[] = [
    {
      key: 'match',
      header: 'Match',
      render: (row) => (
        <span className="text-text-primary font-medium">
          {row.homeTeam && row.awayTeam
            ? `${row.homeTeam} vs ${row.awayTeam}`
            : `Match #${row.matchId}`}
        </span>
      ),
    },
    {
      key: 'model',
      header: 'Model',
      render: (row) => <span className="text-text-secondary text-xs">{row.model}</span>,
    },
    {
      key: 'coverage',
      header: 'Coverage',
      render: (row) => (
        <span className="text-text-secondary">{row.coverageScore != null ? `${row.coverageScore}%` : '—'}</span>
      ),
    },
    {
      key: 'settlement',
      header: 'Settlement',
      render: (row) => <StatusBadge status={row.settlement} />,
    },
    {
      key: 'markets',
      header: 'Markets',
      render: (row) => (
        <span className="text-text-muted text-xs">
          {row.wonMarkets != null && row.settledMarkets != null
            ? `${row.wonMarkets}/${row.settledMarkets}`
            : '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => <span className="text-text-muted text-xs">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Link href={`/predictions/${row.id}`} className="text-secondary text-xs hover:underline">
          View
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Predictions" description="All generated predictions" />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={settlement}
          onChange={(e) => { setSettlement(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-2 border border-border outline-none"
        >
          <option value="">All settlements</option>
          {SETTLEMENT_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        keyExtractor={(r) => r.id}
        loading={isLoading}
        emptyMessage="No predictions found"
      />

      {/* Pagination */}
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-text-muted text-sm font-sans">
            Page {page} · {data.total} total
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * data.pageSize >= data.total}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
