import 'server-only';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

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

export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/verify-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': ADMIN_TOKEN,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return false;
    const json = (await res.json()) as { data?: { valid?: boolean } };
    return json.data?.valid === true;
  } catch {
    return false;
  }
}

/** Server-side fetch to the backend with admin token. Used by API proxy and Server Actions. */
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': ADMIN_TOKEN,
      ...init?.headers,
    },
  });
}
