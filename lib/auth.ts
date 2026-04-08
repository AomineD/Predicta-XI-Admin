import 'server-only';

import { adminEnv } from '@/lib/env';

// Rate limiting for login attempts (in-memory, resets on restart)
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = attempts.get(ip);

  if (record && now < record.resetAt) {
    if (record.count >= MAX_ATTEMPTS) {
      return { allowed: false, retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000) };
    }
    record.count++;
    return { allowed: true };
  }

  attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  return { allowed: true };
}

export function clearRateLimit(ip: string): void {
  attempts.delete(ip);
}

export async function getSessionVersion(email: string, password: string): Promise<number | null> {
  try {
    const res = await fetch(`${adminEnv.BACKEND_URL}/admin/verify-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminEnv.ADMIN_TOKEN,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { valid?: boolean; sessionVersion?: number } };
    return json.data?.valid === true && typeof json.data.sessionVersion === 'number'
      ? json.data.sessionVersion
      : null;
  } catch {
    return null;
  }
}

/** Server-side fetch to the backend with admin token. Used by API proxy and Server Actions. */
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${adminEnv.BACKEND_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminEnv.ADMIN_TOKEN,
      ...init?.headers,
    },
  });
}
