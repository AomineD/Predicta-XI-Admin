'use server';

import { backendFetch } from '@/lib/auth';

export interface PasswordActionState {
  error?: string;
  success?: string;
  step?: 'email' | 'code' | 'newPassword' | 'done';
}

export async function requestResetCode(
  _prevState: PasswordActionState | undefined,
  formData: FormData,
): Promise<PasswordActionState> {
  const email = formData.get('email') as string;
  if (!email) return { error: 'Email is required', step: 'email' };

  try {
    const res = await backendFetch('/admin/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { error?: { message?: string } })?.error?.message ?? 'Failed to send reset code', step: 'email' };
    }

    return { success: 'Reset code sent to your email', step: 'code' };
  } catch {
    return { error: 'Failed to connect to server', step: 'email' };
  }
}

export async function resetPassword(
  _prevState: PasswordActionState | undefined,
  formData: FormData,
): Promise<PasswordActionState> {
  const email = formData.get('email') as string;
  const code = formData.get('code') as string;
  const newPassword = formData.get('newPassword') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!email || !code || !newPassword) {
    return { error: 'All fields are required', step: 'newPassword' };
  }

  if (newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters', step: 'newPassword' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match', step: 'newPassword' };
  }

  try {
    const res = await backendFetch('/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { error?: { message?: string } })?.error?.message ?? 'Failed to reset password';
      return { error: msg, step: 'newPassword' };
    }

    return { success: 'Password changed successfully. You can now log in.', step: 'done' };
  } catch {
    return { error: 'Failed to connect to server', step: 'newPassword' };
  }
}
