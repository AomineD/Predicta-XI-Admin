'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import type { DailySeriesPoint } from './charts-types';

const SOURCE_COLORS: Record<string, string> = {
  prediction: '#4DA8FF',
  combinada: '#A855F7',
};

const ANOMALY_COLOR = '#F59E0B';

interface DailyRow {
  day: string;
  prediction: number;
  combinada: number;
  total: number;
  isAnomaly: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function DailyCostChart({ data, loading }: { data: DailySeriesPoint[] | undefined; loading: boolean }) {
  const rows = useMemo<DailyRow[]>(() => {
    if (!data) return [];
    const byDay = new Map<string, DailyRow>();
    for (const point of data) {
      const cost = parseFloat(point.costUsd) || 0;
      const existing = byDay.get(point.day) ?? { day: point.day, prediction: 0, combinada: 0, total: 0, isAnomaly: false };
      if (point.group === 'combinada') existing.combinada += cost;
      else existing.prediction += cost;
      existing.total = existing.prediction + existing.combinada;
      byDay.set(point.day, existing);
    }
    const list = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
    const m = median(list.map((r) => r.total));
    if (m > 0) {
      for (const r of list) r.isAnomaly = r.total > 2 * m;
    }
    return list;
  }, [data]);

  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">
          Daily Cost
        </h2>
        <span className="text-[10px] text-text-muted font-sans">
          stacked by source · anomaly &gt;2× median
        </span>
      </div>
      {isEmpty ? (
        <div className="h-[220px] flex items-center justify-center text-xs text-text-muted">No data in range</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows}>
            <XAxis dataKey="day" tick={{ fill: '#98A2B3', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#98A2B3', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <Tooltip
              contentStyle={{ background: '#1F2A40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#F5F7FB', fontSize: 12 }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              formatter={(v, name) => [`$${Number(v).toFixed(4)}`, name === 'prediction' ? 'Prediction' : 'Combinada']}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#98A2B3' }}
              iconType="circle"
              formatter={(v) => (v === 'prediction' ? 'Prediction' : 'Combinada')}
            />
            <Bar dataKey="prediction" stackId="a" radius={[0, 0, 0, 0]}>
              {rows.map((r, i) => (
                <Cell key={`p-${i}`} fill={r.isAnomaly ? ANOMALY_COLOR : SOURCE_COLORS.prediction} />
              ))}
            </Bar>
            <Bar dataKey="combinada" stackId="a" radius={[6, 6, 0, 0]}>
              {rows.map((r, i) => (
                <Cell key={`c-${i}`} fill={r.isAnomaly ? ANOMALY_COLOR : SOURCE_COLORS.combinada} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
