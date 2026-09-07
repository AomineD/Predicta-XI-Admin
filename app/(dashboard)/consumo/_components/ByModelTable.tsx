'use client';

import { formatCost, formatTokens } from './format';

export interface ByModelRow {
  model: string;
  provider: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheHitTokens: number;
  costUsd: string;
  avgCostPerCall: string;
  pricing: {
    inputPer1M: number;
    outputPer1M: number;
    inputCacheHitPer1M?: number;
    inputCacheMissPer1M?: number;
    hasOffPeakDiscount?: boolean;
  } | null;
}

function formatPrice(rate: number | undefined): string {
  if (rate === undefined || rate === null) return '—';
  // Cache-hit rates run in the thousandths; two decimals would print $0.01.
  return `$${rate < 0.1 ? rate.toFixed(3) : rate.toFixed(2)}`;
}

function formatShare(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${((part / whole) * 100).toFixed(0)}%`;
}

export function ByModelTable({ rows, totalCost }: { rows: ByModelRow[]; totalCost: number }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider font-sans">
          By Model
        </h2>
        <span className="text-[10px] text-text-muted font-sans">
          peak $/1M rates · DeepSeek bills half off-peak
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-xs text-text-muted">No data in range</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted font-sans">
                <th className="text-left font-medium pb-2 pr-3">Model</th>
                <th className="text-left font-medium pb-2 pr-3">Provider</th>
                <th className="text-right font-medium pb-2 pr-3">Calls</th>
                <th className="text-right font-medium pb-2 pr-3">Input</th>
                <th className="text-right font-medium pb-2 pr-3">Cache hit</th>
                <th className="text-right font-medium pb-2 pr-3">Output</th>
                <th className="text-right font-medium pb-2 pr-3">Reasoning</th>
                <th className="text-right font-medium pb-2 pr-3">Cost</th>
                <th className="text-right font-medium pb-2 pr-3">$/Call</th>
                <th className="text-right font-medium pb-2 pr-3">$/1M hit</th>
                <th className="text-right font-medium pb-2 pr-3">$/1M miss</th>
                <th className="text-right font-medium pb-2">$/1M out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cost = parseFloat(r.costUsd) || 0;
                const share = totalCost > 0 ? cost / totalCost : 0;
                const heavy = share >= 0.4;
                return (
                  <tr key={`${r.model}::${r.provider}`} className="border-t border-white/5">
                    <td className={`py-2 pr-3 font-mono ${heavy ? 'text-amber-300' : 'text-text-primary'}`}>{r.model}</td>
                    <td className="py-2 pr-3 text-text-secondary">{r.provider}</td>
                    <td className="py-2 pr-3 text-right text-text-primary font-mono">{r.calls.toLocaleString('en-US')}</td>
                    <td className="py-2 pr-3 text-right text-text-secondary font-mono">{formatTokens(r.inputTokens)}</td>
                    <td className="py-2 pr-3 text-right text-text-muted font-mono">{formatShare(r.cacheHitTokens, r.inputTokens)}</td>
                    <td className="py-2 pr-3 text-right text-text-secondary font-mono">{formatTokens(r.outputTokens)}</td>
                    <td className="py-2 pr-3 text-right text-text-muted font-mono">{formatShare(r.reasoningTokens, r.outputTokens)}</td>
                    <td className={`py-2 pr-3 text-right font-semibold font-mono ${heavy ? 'text-amber-300' : 'text-text-primary'}`}>
                      {formatCost(r.costUsd)}
                    </td>
                    <td className="py-2 pr-3 text-right text-text-secondary font-mono">{formatCost(r.avgCostPerCall)}</td>
                    <td className="py-2 pr-3 text-right text-text-muted font-mono">{formatPrice(r.pricing?.inputCacheHitPer1M)}</td>
                    <td className="py-2 pr-3 text-right text-text-muted font-mono">{formatPrice(r.pricing?.inputCacheMissPer1M ?? r.pricing?.inputPer1M)}</td>
                    <td className="py-2 text-right text-text-muted font-mono">{formatPrice(r.pricing?.outputPer1M)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
