/**
 * Every kind of LLM call the backend records, with its display name and chart
 * colour. Single source of truth: the badge, the source filter and the donut all
 * read from here, so adding a call type on the backend is one edit here — the
 * previous two-entry maps scattered across three files were how the auxiliary
 * call types stayed invisible in this page.
 *
 * Mirrors LLM_CALL_TYPES in the backend's llm-call-log.repository.ts.
 */
export const CALL_TYPES = [
  'prediction',
  'combinada',
  'user_combinada_opinion',
  'quiniela',
  'quiniela_retry',
  'preview_translation',
  'news_extraction',
  'home_announcement',
  'live_narration',
  'telegram_copy',
] as const;

export type CallType = (typeof CALL_TYPES)[number];

export const CALL_TYPE_LABELS: Record<CallType, string> = {
  prediction: 'Prediction',
  combinada: 'Combinada',
  user_combinada_opinion: 'User opinion',
  quiniela: 'Quiniela',
  quiniela_retry: 'Quiniela retry',
  preview_translation: 'Preview translation',
  news_extraction: 'News extraction',
  home_announcement: 'Home announcement',
  live_narration: 'Live narration',
  telegram_copy: 'Telegram copy',
};

export const CALL_TYPE_COLORS: Record<CallType, string> = {
  prediction: '#4DA8FF',
  combinada: '#A855F7',
  user_combinada_opinion: '#C084FC',
  quiniela: '#22C55E',
  quiniela_retry: '#86EFAC',
  preview_translation: '#F59E0B',
  news_extraction: '#F97316',
  home_announcement: '#EC4899',
  live_narration: '#14B8A6',
  telegram_copy: '#38BDF8',
};

export function isCallType(value: unknown): value is CallType {
  return typeof value === 'string' && (CALL_TYPES as readonly string[]).includes(value);
}

export function callTypeLabel(value: string): string {
  return isCallType(value) ? CALL_TYPE_LABELS[value] : value;
}

export function callTypeColor(value: string): string {
  return isCallType(value) ? CALL_TYPE_COLORS[value] : '#475569';
}
