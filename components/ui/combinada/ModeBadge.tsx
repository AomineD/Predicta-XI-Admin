import { Flame, Shield, Zap } from 'lucide-react';

export type RiskMode = 'bold' | 'precise' | 'balanced';

interface ModeBadgeProps {
  mode: RiskMode | string;
}

const STYLES: Record<RiskMode, { fg: string; bg: string; border: string; Icon: typeof Flame; label: string }> = {
  bold: {
    fg: '#FCA5A5',
    bg: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.28)',
    Icon: Flame,
    label: 'BOLD',
  },
  precise: {
    fg: '#86EFAC',
    bg: 'rgba(34,197,94,0.10)',
    border: 'rgba(34,197,94,0.28)',
    Icon: Shield,
    label: 'PRECISE',
  },
  balanced: {
    fg: '#93C5FD',
    bg: 'rgba(77,168,255,0.10)',
    border: 'rgba(77,168,255,0.28)',
    Icon: Zap,
    label: 'BALANCED',
  },
};

export function ModeBadge({ mode }: ModeBadgeProps) {
  const key = (mode?.toLowerCase() as RiskMode) in STYLES ? (mode.toLowerCase() as RiskMode) : 'balanced';
  const s = STYLES[key];
  const Icon = s.Icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {s.label}
    </span>
  );
}
