import { formatCost, formatTokens } from './format';
import type { ConsumoSummary } from './types';
import type { DailySeriesPoint } from './charts-types';

interface MostExpensiveDay {
  day: string;
  cost: number;
}

function findMostExpensiveDay(daily: DailySeriesPoint[] | undefined): MostExpensiveDay | null {
  if (!daily || daily.length === 0) return null;
  const totals = new Map<string, number>();
  for (const point of daily) {
    totals.set(point.day, (totals.get(point.day) ?? 0) + (parseFloat(point.costUsd) || 0));
  }
  let best: MostExpensiveDay | null = null;
  for (const [day, cost] of totals) {
    if (!best || cost > best.cost) best = { day, cost };
  }
  return best && best.cost > 0 ? best : null;
}

function formatShortDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export function SummaryCards({
  summary,
  daily,
}: {
  summary: ConsumoSummary;
  daily: DailySeriesPoint[] | undefined;
}) {
  const totalCost = parseFloat(summary.totalCostUsd) || 0;
  const expensive = findMostExpensiveDay(daily);

  // Calls the provider refused (402, auth, rate limit) never reached the model:
  // they burn no tokens, so leaving them in the denominator makes every call
  // look cheaper than it is. A run of them is also the shape of an empty balance.
  const billedCalls = Math.max(0, summary.totalCalls - (summary.rejectedCount ?? 0));
  const avgPerCall = billedCalls > 0 ? totalCost / billedCalls : 0;

  const reasoningShare = summary.totalOutputTokens > 0
    ? (summary.totalReasoningTokens / summary.totalOutputTokens) * 100
    : 0;
  const cacheHitShare = summary.totalInputTokens > 0
    ? (summary.totalCacheHitTokens / summary.totalInputTokens) * 100
    : 0;

  const cards: Array<{ label: string; value: string; sub?: string; color?: string }> = [
    { label: 'Total Calls', value: summary.totalCalls.toLocaleString('en-US') },
    { label: 'Success', value: summary.successCount.toLocaleString('en-US'), color: 'text-success' },
    {
      label: 'Errors',
      value: summary.failureCount.toLocaleString('en-US'),
      color: 'text-danger',
      sub: summary.rejectedCount > 0
        ? `${summary.rejectedCount.toLocaleString('en-US')} rejected, unbilled`
        : undefined,
    },
    { label: 'Total Cost', value: formatCost(summary.totalCostUsd) },
    { label: 'Avg / Call', value: formatCost(avgPerCall), sub: 'billed calls only' },
    {
      label: 'Top Day',
      value: expensive ? formatCost(expensive.cost) : '—',
      sub: expensive ? formatShortDay(expensive.day) : 'no data',
    },
    {
      // Thinking tokens are billed as output, the dearest bucket — this is the
      // number to watch before touching anything else.
      label: 'Reasoning',
      value: `${reasoningShare.toFixed(0)}%`,
      sub: `${formatTokens(summary.totalReasoningTokens)} of output`,
      color: reasoningShare >= 60 ? 'text-amber-300' : undefined,
    },
    {
      label: 'Cache Hit',
      value: `${cacheHitShare.toFixed(0)}%`,
      sub: `${formatTokens(summary.totalCacheHitTokens)} of input`,
      color: cacheHitShare > 0 && cacheHitShare < 30 ? 'text-amber-300' : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl px-4 py-3"
          style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-xs text-text-muted font-sans uppercase tracking-wider mb-1">{card.label}</p>
          <p className={`text-lg font-semibold font-sans ${card.color ?? 'text-text-primary'}`}>{card.value}</p>
          {card.sub && <p className="text-[10px] text-text-muted font-sans mt-0.5">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}
