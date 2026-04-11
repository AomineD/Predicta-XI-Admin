interface ConfidenceIconProps {
  confidence: number;
  type?: 'circle' | 'bars';
}

function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 65) return 'high';
  if (confidence >= 45) return 'medium';
  return 'low';
}

export function ConfidenceCircle({ confidence }: { confidence: number }) {
  const level = getConfidenceLevel(confidence);
  const colors = {
    high: '#22C55E',    // success green
    medium: '#F59E0B',  // warning amber
    low: '#EF4444',     // danger red
  };

  const color = colors[level];
  const size = 40;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (confidence / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1E293B"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ConfidenceBars({ confidence }: { confidence: number }) {
  const level = getConfidenceLevel(confidence);
  const colors = {
    high: '#22C55E',    // success green
    medium: '#F59E0B',  // warning amber
    low: '#EF4444',     // danger red
  };

  const filledBars = Math.round(confidence / 20);

  return (
    <div style={{ display: 'flex', gap: '2px', height: '24px', alignItems: 'flex-end', flexShrink: 0 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: '4px',
            height: `${4 + i * 4}px`,
            borderRadius: '2px',
            backgroundColor: i <= filledBars ? colors[level] : '#374151',
          }}
        />
      ))}
    </div>
  );
}

export function ConfidenceIcon({ confidence, type = 'circle' }: ConfidenceIconProps) {
  if (type === 'bars') {
    return <ConfidenceBars confidence={confidence} />;
  }
  return <ConfidenceCircle confidence={confidence} />;
}
