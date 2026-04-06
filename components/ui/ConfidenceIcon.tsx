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

  const rotations = {
    high: '-45deg',
    medium: '45deg',
    low: '135deg',
  };

  return (
    <div
      style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        border: `3px solid ${colors[level]}`,
        borderTopColor: 'transparent',
        borderRightColor: 'transparent',
        transform: `rotate(${rotations[level]})`,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}

export function ConfidenceBars({ confidence }: { confidence: number }) {
  const level = getConfidenceLevel(confidence);
  const colors = {
    high: '#EF4444',    // danger red
    medium: '#F59E0B',  // warning amber
    low: '#22C55E',     // success green
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
