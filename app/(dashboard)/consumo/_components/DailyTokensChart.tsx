'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { DailySeriesPoint } from './charts-types';

interface DailyRow {
  day: string;
  inputTokens: number;
  outputTokens: number;
}

function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function DailyTokensChart({ data, loading }: { data: DailySeriesPoint[] | undefined; loading: boolean }) {
  const rows = useMemo<DailyRow[]>(() => {
    if (!data) return [];
    const byDay = new Map<string, DailyRow>();
    for (const point of data) {
      const existing = byDay.get(point.day) ?? { day: point.day, inputTokens: 0, outputTokens: 0 };
      existing.inputTokens += point.inputTokens;
      existing.outputTokens += point.outputTokens;
      byDay.set(point.day, existing);
    }
    return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [data]);

  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">
          Daily Tokens
        </h2>
        <span className="text-[10px] text-text-muted font-sans">input + output, stacked</span>
      </div>
      {isEmpty ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-text-muted">No data in range</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={rows}>
            <defs>
              <linearGradient id="tokens-input" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4DA8FF" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#4DA8FF" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="tokens-output" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7CFF5B" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#7CFF5B" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fill: '#98A2B3', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#98A2B3', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => compactTokens(v)}
            />
            <Tooltip
              contentStyle={{ background: '#1F2A40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#F5F7FB', marginBottom: 4 }}
              itemStyle={{ color: '#F5F7FB' }}
              formatter={(v, name) => [Number(v).toLocaleString('en-US'), name === 'inputTokens' ? 'Input' : 'Output']}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#98A2B3' }}
              iconType="circle"
              formatter={(v) => (v === 'inputTokens' ? 'Input' : 'Output')}
            />
            <Area
              type="monotone"
              dataKey="inputTokens"
              stackId="t"
              stroke="#4DA8FF"
              fill="url(#tokens-input)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="outputTokens"
              stackId="t"
              stroke="#7CFF5B"
              fill="url(#tokens-output)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
