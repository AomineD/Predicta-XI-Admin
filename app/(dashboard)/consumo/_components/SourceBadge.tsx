import type { CallType } from './types';

const STYLES: Record<CallType, { bg: string; text: string; label: string }> = {
  prediction: { bg: 'bg-blue-400/15', text: 'text-blue-300', label: 'Prediction' },
  combinada: { bg: 'bg-purple-400/15', text: 'text-purple-300', label: 'Combinada' },
};

export function SourceBadge({ callType }: { callType: CallType }) {
  const style = STYLES[callType] ?? STYLES.prediction;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}
