import { adminEnv } from '@/lib/env';

export interface SessionPayload {
  email: string;
  sessionVersion: number;
  expiresAt: string;
  [key: string]: unknown;
}

interface BackendSessionState {
  email: string;
  sessionVersion: number;
}

export async function fetchSessionState(): Promise<BackendSessionState | null> {
  try {
    const response = await fetch(`${adminEnv.BACKEND_URL}/admin/session-state`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminEnv.ADMIN_TOKEN,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as { data?: BackendSessionState };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function validateSessionPayload(payload: SessionPayload): Promise<boolean> {
  const state = await fetchSessionState();
  if (!state) {
    return false;
  }

  return state.email === payload.email && state.sessionVersion === payload.sessionVersion;
}
