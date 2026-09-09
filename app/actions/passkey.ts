'use server';

import { backendFetch } from '@/lib/auth';
import { createSession } from '@/lib/session';
import type { AuthenticationResponseJSON } from '@/lib/webauthn';

/**
 * Login por passkey.
 *
 * Va por Server Actions y no por `/api/proxy` porque el proxy exige sesión, que
 * es justo lo que aún no hay. Así el token de admin sigue viviendo solo en el
 * servidor y la lista de rutas públicas del proxy no crece.
 */

export interface PasskeyLoginStart {
  challengeId: string;
  options: Record<string, unknown>;
}

export interface PasskeyLoginResult {
  ok: boolean;
  error?: string;
}

/**
 * Pide el reto que firmará el autenticador.
 *
 * No consume el contador de intentos del panel: ese lo comparte el login por
 * contraseña, y gastarlo aquí dejaría a Diego sin su camino de recuperación solo
 * por abrir y cancelar el diálogo del sistema. Los intentos de passkey los
 * cuenta el backend, con su propia etiqueta y su límite de ruta.
 */
export async function beginPasskeyLogin(): Promise<PasskeyLoginStart | { error: string }> {
  try {
    const res = await backendFetch('/admin/passkeys/login/options', { method: 'POST', body: '{}' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { error: body?.error?.message ?? 'Passkeys are not available right now.' };
    }

    const json = (await res.json()) as { data?: PasskeyLoginStart };
    if (!json.data?.challengeId || !json.data.options) {
      return { error: 'Passkeys are not available right now.' };
    }

    return json.data;
  } catch {
    return { error: 'Failed to connect to server' };
  }
}

/** Entrega la firma al backend y, si cuadra, abre la sesión. */
export async function finishPasskeyLogin(
  challengeId: string,
  response: AuthenticationResponseJSON,
): Promise<PasskeyLoginResult> {
  try {
    const res = await backendFetch('/admin/passkeys/login/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, response }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, error: body?.error?.message ?? 'Could not verify the passkey.' };
    }

    const json = (await res.json()) as {
      data?: { valid?: boolean; email?: string; sessionVersion?: number };
    };
    const data = json.data;

    if (data?.valid !== true || !data.email || typeof data.sessionVersion !== 'number') {
      return { ok: false, error: 'This passkey is not registered for the admin panel.' };
    }

    await createSession(data.email, data.sessionVersion);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Failed to connect to server' };
  }
}
