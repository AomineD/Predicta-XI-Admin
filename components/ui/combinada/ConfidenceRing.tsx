interface ConfidenceRingProps {
  value: number;
  size?: number;
  stroke?: number;
}

export function ConfidenceRing({ value, size = 56, stroke = 5 }: ConfidenceRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const pct = clamped / 100;
  const color = value >= 75 ? '#7CFF5B' : value >= 50 ? '#4DA8FF' : '#F59E0B';

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-display font-bold text-text-primary"
        style={{ fontSize: size * 0.32, letterSpacing: -0.5 }}
      >
        {clamped}
      </div>
    </div>
  );
}
