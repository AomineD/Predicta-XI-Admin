import { Crown } from 'lucide-react';

export function PremiumPill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: 'linear-gradient(180deg, rgba(167,139,250,0.20), rgba(167,139,250,0.08))',
        color: '#C4B5FD',
        border: '1px solid rgba(167,139,250,0.32)',
      }}
    >
      <Crown size={11} strokeWidth={2.2} />
      Premium
    </span>
  );
}
