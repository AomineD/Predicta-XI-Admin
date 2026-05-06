'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCost } from './format';
import type { CallType } from './types';

export interface BySourceRow {
  callType: string;
  calls: number;
  costUsd: string;
  inputTokens: number;
  outputTokens: number;
}

const COLORS: Record<string, string> = {
  prediction: '#4DA8FF',
  combinada: '#A855F7',
};

const LABELS: Record<string, string> = {
  prediction: 'Prediction',
  combinada: 'Combinada',
};

export function BySourceDonut({
  rows,
  onSelectSource,
  activeSource,
}: {
  rows: BySourceRow[];
  onSelectSource: (source: '' | CallType) => void;
  activeSource: '' | CallType;
}) {
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.callType,
        value: parseFloat(r.costUsd) || 0,
        calls: r.calls,
      })),
    [rows],
  );

  const total = chartData.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">
          By Source
        </h2>
        <span className="text-[10px] text-text-muted font-sans">click slice to filter</span>
      </div>
      {total === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-text-muted">No data in range</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 items-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={2}
                onClick={(d) => {
                  const name = (d as { name?: string })?.name;
                  if (name === 'prediction' || name === 'combinada') {
                    onSelectSource(activeSource === name ? '' : name);
                  }
                }}
                cursor="pointer"
              >
                {chartData.map((d) => (
                  <Cell
                    key={d.name}
                    fill={COLORS[d.name] ?? '#475569'}
                    stroke={activeSource === d.name ? '#F5F7FB' : 'transparent'}
                    strokeWidth={activeSource === d.name ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1F2A40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F5F7FB', fontSize: 12 }}
                formatter={(v, name) => [formatCost(Number(v)), LABELS[name as string] ?? String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2">
            {chartData.map((d) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <button
                  key={d.name}
                  onClick={() => onSelectSource(activeSource === d.name ? '' : (d.name as CallType))}
                  className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition-colors ${
                    activeSource === d.name ? 'bg-surface-3' : 'hover:bg-surface-3/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[d.name] ?? '#475569' }} />
                    <span className="text-text-secondary font-sans">{LABELS[d.name] ?? d.name}</span>
                  </span>
                  <span className="text-text-primary font-mono">
                    {formatCost(d.value)} <span className="text-text-muted">({pct.toFixed(0)}%)</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
