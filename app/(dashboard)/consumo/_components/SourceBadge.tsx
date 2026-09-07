import { callTypeColor, callTypeLabel } from './call-types';

export function SourceBadge({ callType }: { callType: string }) {
  const color = callTypeColor(callType);
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
      style={{ background: `${color}26`, color }}
    >
      {callTypeLabel(callType)}
    </span>
  );
}
