'use client';

import type { CallType } from './types';

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

const SOURCE_OPTIONS: Array<{ value: '' | CallType; label: string }> = [
  { value: '', label: 'All Sources' },
  { value: 'prediction', label: 'Prediction' },
  { value: 'combinada', label: 'Combinada' },
];

export interface ConsumoFiltersValue {
  dateFrom: string;
  dateTo: string;
  provider: string;
  status: string;
  source: '' | CallType;
}

export function ConsumoFilters({
  value,
  onChange,
  onClear,
}: {
  value: ConsumoFiltersValue;
  onChange: (next: Partial<ConsumoFiltersValue>) => void;
  onClear: () => void;
}) {
  const hasActive = value.dateFrom || value.dateTo || value.provider || value.status || value.source;

  return (
    <div
      className="rounded-2xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3"
      style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted font-sans">From</span>
        <input
          type="date"
          value={value.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
          className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-surface-3 text-text-primary border-none outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted font-sans">To</span>
        <input
          type="date"
          value={value.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })}
          className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-surface-3 text-text-primary border-none outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted font-sans">Source</span>
        <select
          value={value.source}
          onChange={(e) => onChange({ source: e.target.value as '' | CallType })}
          className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-surface-3 text-text-primary border-none outline-none"
        >
          {SOURCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted font-sans">Provider</span>
        <select
          value={value.provider}
          onChange={(e) => onChange({ provider: e.target.value })}
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
          value={value.status}
          onChange={(e) => onChange({ status: e.target.value })}
          className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-surface-3 text-text-primary border-none outline-none"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>
      {hasActive && (
        <button
          onClick={onClear}
          className="self-end px-3 py-1.5 rounded-lg text-xs font-sans font-medium bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
