'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime } from '@/lib/utils';

interface PredictionJob {
  id: string;
  status: string;
  model: string;
  matchesProcessed: number;
  succeeded: number;
  failed: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

interface JobsResponse {
  items: PredictionJob[];
  total: number;
}

export default function JobsPage() {
  const { data, isLoading } = useQuery<JobsResponse>({
    queryKey: ['jobs'],
    queryFn: () => api.get('/admin/jobs'),
    refetchInterval: 10_000,
  });

  const columns: Column<PredictionJob>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'model',
      header: 'Model',
      render: (row) => <span className="text-text-secondary text-xs">{row.model}</span>,
    },
    {
      key: 'processed',
      header: 'Processed',
      render: (row) => (
        <span className="font-semibold text-text-primary text-sm">
          {row.matchesProcessed}
        </span>
      ),
    },
    {
      key: 'results',
      header: 'OK / Failed',
      render: (row) => (
        <span className="text-sm font-sans">
          <span className="text-success">{row.succeeded}</span>
          <span className="text-text-muted"> / </span>
          <span className="text-danger">{row.failed}</span>
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
      render: (row) => <span className="text-text-muted text-xs">{formatDateTime(row.completedAt)}</span>,
    },
    {
      key: 'error',
      header: 'Error',
      render: (row) =>
        row.errorMessage ? (
          <span className="text-danger text-xs truncate max-w-xs block">{row.errorMessage}</span>
        ) : (
          <span className="text-text-muted text-xs">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader title="Jobs" description="Scheduler job history — auto-refreshes every 10s" />

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        keyExtractor={(r) => r.id}
        loading={isLoading}
        emptyMessage="No jobs found"
      />
    </div>
  );
}
