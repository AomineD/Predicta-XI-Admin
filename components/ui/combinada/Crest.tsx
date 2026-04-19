interface CrestProps {
  team: string;
  size?: number;
  variant?: number;
}

const PALETTES: Array<[string, string]> = [
  ['#1E40AF', '#60A5FA'],
  ['#7F1D1D', '#FCA5A5'],
  ['#166534', '#86EFAC'],
  ['#713F12', '#FDE047'],
  ['#4C1D95', '#C4B5FD'],
  ['#0F172A', '#94A3B8'],
  ['#9A3412', '#FDBA74'],
  ['#134E4A', '#5EEAD4'],
];

function initials(team: string): string {
  return team
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Crest({ team, size = 28, variant = 0 }: CrestProps) {
  const [bg, fg] = PALETTES[Math.abs(variant) % PALETTES.length];
  return (
    <div
      className="flex items-center justify-center font-display font-bold border border-[rgba(255,255,255,0.08)] shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: `linear-gradient(135deg, ${bg} 0%, ${bg} 60%, ${fg}33 100%)`,
        fontSize: size * 0.38,
        color: fg,
        letterSpacing: -0.3,
      }}
      title={team}
    >
      {initials(team)}
    </div>
  );
}
