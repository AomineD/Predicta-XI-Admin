import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value}%`;
}

/**
 * Flatten a bilingual field to a plain string safe to render as a React child.
 *
 * Backend may return a pick's `reasoning`/`summary`/`dataQualityNote` as:
 *   - a plain string,
 *   - an object `{ en: string, es: string }` (parsed JSON from LLM),
 *   - a JSON-serialized string of the object above.
 *
 * Rendering the object directly throws React error #31. Prefer Spanish, then
 * English, then stringify as last resort.
 */
export function bilingualToString(value: unknown, preferred: 'es' | 'en' = 'es'): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    // Try to parse in case it's a JSON-serialized {en, es} — common from older rows
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && ('en' in parsed || 'es' in parsed)) {
        return bilingualToString(parsed, preferred);
      }
    } catch { /* plain string, fall through */ }
    return value;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const fallback: 'es' | 'en' = preferred === 'es' ? 'en' : 'es';
    const picked = obj[preferred] ?? obj[fallback];
    if (typeof picked === 'string') return picked;
    return JSON.stringify(value);
  }
  return String(value);
}
