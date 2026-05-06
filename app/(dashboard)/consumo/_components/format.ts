export function formatTokens(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

export function formatCost(cost: string | number | null): string {
  if (cost === null || cost === undefined) return '—';
  const n = typeof cost === 'number' ? cost : parseFloat(cost);
  if (isNaN(n) || n === 0) return '$0.0000';
  return `$${n.toFixed(4)}`;
}
