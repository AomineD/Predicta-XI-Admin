'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSession, deleteSession } from '@/lib/session';
import { verifyCredentials, checkRateLimit, clearRateLimit } from '@/lib/auth';

export interface LoginState {
  error?: string;
}

export async function login(_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  // Rate limiting by IP
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateCheck = checkRateLimit(ip);

  if (!rateCheck.allowed) {
    return { error: `Too many login attempts. Try again in ${rateCheck.retryAfterSeconds} seconds.` };
  }

  const valid = await verifyCredentials(email, password);

  if (!valid) {
    return { error: 'Invalid email or password' };
  }

  // Clear rate limit on success
  clearRateLimit(ip);

  await createSession(email);
  redirect('/');
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect('/login');
}
