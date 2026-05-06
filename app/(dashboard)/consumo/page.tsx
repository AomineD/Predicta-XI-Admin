'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime } from '@/lib/utils';
import { Check, X } from 'lucide-react';

import type { ConsumoResponse, ConsumoRow, ConsumoSummary, SortBy, SortOrder } from './_components/types';
import { formatCost, formatTokens } from './_components/format';
import { SummaryCards } from './_components/SummaryCards';
import { SourceBadge } from './_components/SourceBadge';
import { InfoModal } from './_components/InfoModal';
import { ErrorModal } from './_components/ErrorModal';
import { ActionsDropdown } from './_components/ActionsDropdown';
import { ConsumoFilters, type ConsumoFiltersValue } from './_components/ConsumoFilters';

const PAGE_SIZE = 20;

const INITIAL_FILTERS: ConsumoFiltersValue = {
  dateFrom: '',
  dateTo: '',
  provider: '',
  status: '',
  source: '',
};

export default function ConsumoPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ConsumoFiltersValue>(INITIAL_FILTERS);
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [infoRow, setInfoRow] = useState<ConsumoRow | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const buildParams = (includePaging = true) => {
    const params = new URLSearchParams();
    if (includePaging) {
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
    }
    if (filters.provider) params.set('provider', filters.provider);
    if (filters.status) params.set('success', filters.status);
    if (filters.source) params.set('callType', filters.source);
    if (filters.dateFrom) params.set('from', new Date(filters.dateFrom).toISOString());
    if (filters.dateTo) params.set('to', new Date(filters.dateTo + 'T23:59:59').toISOString());
    return params.toString();
  };

  const { data, isLoading } = useQuery<ConsumoResponse>({
    queryKey: ['consumo', page, filters, sortBy, sortOrder],
    queryFn: () => api.get(`/admin/consumo?${buildParams(true)}`),
  });

  const { data: summary } = useQuery<ConsumoSummary>({
    queryKey: ['consumo-summary', filters],
    queryFn: () => {
      const qs = buildParams(false);
      return api.get(`/admin/consumo/summary${qs ? '?' + qs : ''}`);
    },
  });

  const handleFiltersChange = (next: Partial<ConsumoFiltersValue>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  };

  const handleClear = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  };

  const handleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortBy) => {
    if (sortBy !== field) return '';
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  };

  const columns: Column<ConsumoRow>[] = [
    {
      key: 'id',
      header: 'ID',
      width: 'w-16',
      render: (row) => <span className="text-text-muted text-xs font-mono">{row.id}</span>,
    },
    {
      key: 'createdAt',
      header: `Fecha${sortIndicator('createdAt')}`,
      render: (row) => (
        <button onClick={() => handleSort('createdAt')} className="text-text-muted text-xs hover:text-text-primary transition-colors">
          {formatDateTime(row.createdAt)}
        </button>
      ),
    },
    {
      key: 'success',
      header: 'Status',
      width: 'w-20',
      render: (row) =>
        row.success ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-success/15">
            <Check size={14} className="text-success" />
          </span>
        ) : (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-danger/15">
            <X size={14} className="text-danger" />
          </span>
        ),
    },
    {
      key: 'callType',
      header: 'Source',
      width: 'w-28',
      render: (row) => <SourceBadge callType={row.callType} />,
    },
    {
      key: 'model',
      header: 'Model',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-xs">{row.model}</span>
          {row.isTest && <span className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 text-[10px] font-semibold">TEST</span>}
        </div>
      ),
    },
    {
      key: 'inputTokens',
      header: 'Input Tokens',
      render: (row) => <span className="text-text-primary text-sm font-mono">{formatTokens(row.inputTokens)}</span>,
    },
    {
      key: 'outputTokens',
      header: 'Output Tokens',
      render: (row) => <span className="text-text-primary text-sm font-mono">{formatTokens(row.outputTokens)}</span>,
    },
    {
      key: 'costUsd',
      header: `Gasto${sortIndicator('costUsd')}`,
      render: (row) => (
        <button onClick={() => handleSort('costUsd')} className="text-text-primary text-sm font-semibold font-mono hover:text-primary transition-colors">
          {formatCost(row.costUsd)}
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Opciones',
      width: 'w-28',
      render: (row) => (
        <ActionsDropdown
          row={row}
          onViewInfo={() => setInfoRow(row)}
          onViewError={() => row.error && setErrorText(row.error)}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Consumo" description="LLM API usage — tokens, costs, and debugging. Test predictions are marked as TEST and do not count toward production KPIs/stats." />

      {summary && <SummaryCards summary={summary} />}

      <ConsumoFilters value={filters} onChange={handleFiltersChange} onClear={handleClear} />

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        keyExtractor={(r) => r.id}
        loading={isLoading}
        emptyMessage="No LLM calls found"
      />

      {data && data.total > 0 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-xs text-text-muted font-sans">
            Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {infoRow && <InfoModal row={infoRow} onClose={() => setInfoRow(null)} />}
      {errorText && <ErrorModal error={errorText} onClose={() => setErrorText(null)} />}
    </div>
  );
}
