import { formatCost } from './format';
import type { ConsumoSummary } from './types';

export function SummaryCards({ summary }: { summary: ConsumoSummary }) {
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
