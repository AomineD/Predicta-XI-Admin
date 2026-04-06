type ConfidenceLevel = 'low' | 'medium' | 'high';

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 65) return 'high';
  if (confidence >= 45) return 'medium';
  return 'low';
}

const LEVEL_STYLES: Record<ConfidenceLevel, { bg: string; border: string; text: string }> = {
  low: {
    bg: 'rgba(34, 197, 94, 0.1)',    // success green
    border: '#22C55E',
    text: '#22C55E',
  },
  medium: {
    bg: 'rgba(245, 158, 11, 0.1)',   // warning amber
    border: '#F59E0B',
    text: '#F59E0B',
  },
  high: {
    bg: 'rgba(239, 68, 68, 0.1)',    // danger red
    border: '#EF4444',
    text: '#EF4444',
  },
};

const LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export function ConfidenceLevelBadge({ confidence }: { confidence: number }) {
  const level = getConfidenceLevel(confidence);
  const styles = LEVEL_STYLES[level];

  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: '600',
        border: `1px solid ${styles.border}`,
        color: styles.text,
        backgroundColor: styles.bg,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}
