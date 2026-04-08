'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDateTime } from '@/lib/utils';
import { Check, X, ChevronDown } from 'lucide-react';

// ── Types ──────────────────────���───────────────────────────

interface ConsumoRow {
  id: number;
  createdAt: string;
  success: boolean;
  model: string;
  provider: string;
  isTest: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  latencyMs: number | null;
  llmInput: { systemPrompt: string; userPrompt: string } | null;
  llmOutput: string | null;
  error: string | null;
}

interface ConsumoResponse {
  items: ConsumoRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface ConsumoSummary {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalCostUsd: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

type SortBy = 'createdAt' | 'costUsd';
type SortOrder = 'asc' | 'desc';

// ── Provider options ──────────────────────────────────────

const PROVIDERS = [
  { value: '', label: 'All Providers' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'google', label: 'Google' },
  { value: 'zhipu', label: 'Zhipu' },
  { value: 'moonshot', label: 'Moonshot' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'true', label: 'Success' },
  { value: 'false', label: 'Error' },
];

// ── Helpers ───────────────────────────────────────────────

function formatTokens(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

function formatCost(cost: string | null): string {
  if (!cost) return '—';
  const n = parseFloat(cost);
  if (isNaN(n) || n === 0) return '$0.0000';
  return `$${n.toFixed(4)}`;
}

// ── Info Modal ────────────────────────────────────────────

function InfoModal({ row, onClose }: { row: ConsumoRow; onClose: () => void }) {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary font-sans">
            LLM Call #{row.id} — {row.model}
          </h3>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-auto space-y-4">
          {row.llmInput && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">System Prompt</span>
                  <button
                    onClick={() => handleCopy(row.llmInput!.systemPrompt)}
                    className="text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap p-3 rounded-xl bg-surface-3 max-h-48 overflow-auto">
                  {row.llmInput.systemPrompt}
                </pre>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">User Prompt</span>
                  <button
                    onClick={() => handleCopy(row.llmInput!.userPrompt)}
                    className="text-xs text-text-muted hover:text-text-primary transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap p-3 rounded-xl bg-surface-3 max-h-48 overflow-auto">
                  {row.llmInput.userPrompt}
                </pre>
              </div>
            </>
          )}
          {!row.llmInput && (
            <p className="text-xs text-text-muted italic">No input data available (call may have failed before LLM request)</p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">LLM Output</span>
              {row.llmOutput && (
                <button
                  onClick={() => handleCopy(row.llmOutput!)}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  Copy
                </button>
              )}
            </div>
            <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap p-3 rounded-xl bg-surface-3 max-h-48 overflow-auto">
              {row.llmOutput ?? '— No output —'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Error Modal ───────────────────────────────────────────

function ErrorModal({ error, onClose }: { error: string; onClose: () => void }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(error);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-danger font-sans">Error Log</h3>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
            >
              Copy
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
            >
              Close
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto text-xs text-text-muted font-mono whitespace-pre-wrap p-4 rounded-xl bg-surface-3">
          {error}
        </pre>
      </div>
    </div>
  );
}

// ── Actions Dropdown ──────────────────────────��───────────

function ActionsDropdown({
  row,
  onViewInfo,
  onViewError,
}: {
  row: ConsumoRow;
  onViewInfo: () => void;
  onViewError: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 140;
      const viewportPadding = 12;
      const left = Math.max(viewportPadding, rect.right - menuWidth);

      setMenuStyle({
        top: rect.bottom + 4,
        left,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
      >
        Opciones
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && menuStyle && createPortal(
        <div
          className="fixed z-[100] rounded-xl py-1 min-w-[140px] shadow-lg"
          style={{
            top: menuStyle.top,
            left: menuStyle.left,
            background: '#1A2538',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <button
            onClick={() => { onViewInfo(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs font-sans text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            Ver info
          </button>
          <button
            onClick={() => { if (row.error) { onViewError(); setOpen(false); } }}
            disabled={!row.error}
            className={`w-full text-left px-3 py-2 text-xs font-sans transition-colors ${
              row.error
                ? 'text-text-secondary hover:text-text-primary hover:bg-surface-3'
                : 'text-text-muted/40 cursor-not-allowed'
            }`}
          >
            Ver error
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Summary Cards ────────────────────────��────────────────

function SummaryCards({ summary }: { summary: ConsumoSummary }) {
  const cards = [
    { label: 'Total Calls', value: summary.totalCalls.toLocaleString('en-US') },
    { label: 'Success', value: summary.successCount.toLocaleString('en-US'), color: 'text-success' },
    { label: 'Errors', value: summary.failureCount.toLocaleString('en-US'), color: 'text-danger' },
    { label: 'Total Cost', value: formatCost(summary.totalCostUsd) },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl px-4 py-3"
          style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-xs text-text-muted font-sans uppercase tracking-wider mb-1">{card.label}</p>
          <p className={`text-lg font-semibold font-sans ${card.color ?? 'text-text-primary'}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function ConsumoPage() {
  const [page, setPage] = useState(1);
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [infoRow, setInfoRow] = useState<ConsumoRow | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const pageSize = 20;

  const buildParams = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, sortOrder });
    if (provider) params.set('provider', provider);
    if (status) params.set('success', status);
    if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
    if (dateTo) params.set('to', new Date(dateTo + 'T23:59:59').toISOString());
    return params.toString();
  };

  const { data, isLoading } = useQuery<ConsumoResponse>({
    queryKey: ['consumo', page, provider, status, dateFrom, dateTo, sortBy, sortOrder],
    queryFn: () => api.get(`/admin/consumo?${buildParams()}`),
  });

  const { data: summary } = useQuery<ConsumoSummary>({
    queryKey: ['consumo-summary', dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo) params.set('to', new Date(dateTo + 'T23:59:59').toISOString());
      const qs = params.toString();
      return api.get(`/admin/consumo/summary${qs ? '?' + qs : ''}`);
    },
  });

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

      {/* Filters */}
      <div
        className="rounded-2xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted font-sans">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-surface-3 text-text-primary border-none outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted font-sans">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-surface-3 text-text-primary border-none outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted font-sans">Provider</span>
          <select
            value={provider}
            onChange={(e) => { setProvider(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-surface-3 text-text-primary border-none outline-none"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted font-sans">Status</span>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-surface-3 text-text-primary border-none outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        {(dateFrom || dateTo || provider || status) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setProvider(''); setStatus(''); setPage(1); }}
            className="self-end px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        keyExtractor={(r) => r.id}
        loading={isLoading}
        emptyMessage="No LLM calls found"
      />

      {/* Pagination */}
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

      {/* Modals */}
      {infoRow && <InfoModal row={infoRow} onClose={() => setInfoRow(null)} />}
      {errorText && <ErrorModal error={errorText} onClose={() => setErrorText(null)} />}
    </div>
  );
}
