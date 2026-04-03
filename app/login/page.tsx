'use client';

import { useActionState, useState } from 'react';
import { login, type LoginState } from '@/app/actions/auth';
import { requestResetCode, resetPassword, type PasswordActionState } from '@/app/actions/password';
import { Button } from '@/components/ui/Button';

type View = 'login' | 'forgot-email' | 'forgot-code' | 'forgot-newpass';

export default function LoginPage() {
  const [view, setView] = useState<View>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');

  // Login form
  const [loginState, loginAction, loginPending] = useActionState<LoginState | undefined, FormData>(login, undefined);

  // Forgot password - request code
  const [codeState, codeAction, codePending] = useActionState<PasswordActionState | undefined, FormData>(
    async (_prev, formData) => {
      const result = await requestResetCode(_prev, formData);
      if (result.step === 'code') {
        setResetEmail(formData.get('email') as string);
        setView('forgot-code');
      }
      return result;
    },
    undefined,
  );

  // Forgot password - reset
  const [resetState, resetAction, resetPending] = useActionState<PasswordActionState | undefined, FormData>(
    async (_prev, formData) => {
      const result = await resetPassword(_prev, formData);
      if (result.step === 'done') {
        setView('login');
      }
      return result;
    },
    undefined,
  );

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <h1 className="font-display text-2xl font-semibold text-text-primary tracking-tight">
          Predicta <span className="text-primary">XI</span>
        </h1>
        <p className="text-text-muted text-sm font-sans mt-1">Admin Panel</p>
      </div>

      <div
        className="rounded-2xl p-6"
        style={{ background: '#121A2B', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* LOGIN VIEW */}
        {view === 'login' && (
          <form action={loginAction}>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-5 font-sans">
              Sign In
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs text-text-muted font-sans mb-1">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full h-10 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted focus:border-primary/50 transition-colors"
                  placeholder="admin@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs text-text-muted font-sans mb-1">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full h-10 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted focus:border-primary/50 transition-colors"
                  placeholder="Enter password"
                />
              </div>
            </div>

            {loginState?.error && (
              <p className="text-danger text-xs font-sans mt-3">{loginState.error}</p>
            )}

            <Button type="submit" variant="primary" className="w-full mt-5" loading={loginPending}>
              Sign In
            </Button>

            <button
              type="button"
              onClick={() => { setView('forgot-email'); }}
              className="block w-full text-center text-xs text-text-muted hover:text-primary font-sans mt-4 transition-colors"
            >
              Forgot password?
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD - STEP 1: EMAIL */}
        {view === 'forgot-email' && (
          <form action={codeAction}>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2 font-sans">
              Reset Password
            </h2>
            <p className="text-xs text-text-muted font-sans mb-5">
              Enter your admin email to receive a reset code.
            </p>

            <div>
              <label htmlFor="reset-email" className="block text-xs text-text-muted font-sans mb-1">Email</label>
              <input
                id="reset-email"
                name="email"
                type="email"
                required
                className="w-full h-10 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted focus:border-primary/50 transition-colors"
                placeholder="admin@example.com"
              />
            </div>

            {codeState?.error && (
              <p className="text-danger text-xs font-sans mt-3">{codeState.error}</p>
            )}

            <Button type="submit" variant="primary" className="w-full mt-5" loading={codePending}>
              Send Reset Code
            </Button>

            <button
              type="button"
              onClick={() => setView('login')}
              className="block w-full text-center text-xs text-text-muted hover:text-primary font-sans mt-4 transition-colors"
            >
              Back to login
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD - STEP 2: CODE */}
        {view === 'forgot-code' && (
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2 font-sans">
              Enter Code
            </h2>
            <p className="text-xs text-text-muted font-sans mb-5">
              A 6-digit code was sent to <span className="text-text-primary">{resetEmail}</span>
            </p>

            <div>
              <label htmlFor="reset-code" className="block text-xs text-text-muted font-sans mb-1">Code</label>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full h-12 px-3 rounded-xl text-lg font-sans text-text-primary bg-surface-3 border border-border outline-none text-center tracking-[0.4em] placeholder:text-text-muted focus:border-primary/50 transition-colors"
                placeholder="000000"
              />
            </div>

            <Button
              variant="primary"
              className="w-full mt-5"
              disabled={resetCode.length !== 6}
              onClick={() => setView('forgot-newpass')}
            >
              Verify Code
            </Button>

            <button
              type="button"
              onClick={() => setView('forgot-email')}
              className="block w-full text-center text-xs text-text-muted hover:text-primary font-sans mt-4 transition-colors"
            >
              Resend code
            </button>
          </div>
        )}

        {/* FORGOT PASSWORD - STEP 3: NEW PASSWORD */}
        {view === 'forgot-newpass' && (
          <form action={resetAction}>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2 font-sans">
              New Password
            </h2>
            <p className="text-xs text-text-muted font-sans mb-5">
              Enter your new password (min. 8 characters).
            </p>

            <input type="hidden" name="email" value={resetEmail} />
            <input type="hidden" name="code" value={resetCode} />

            <div className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-xs text-text-muted font-sans mb-1">New Password</label>
                <input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  className="w-full h-10 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted focus:border-primary/50 transition-colors"
                  placeholder="Min. 8 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs text-text-muted font-sans mb-1">Confirm Password</label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  className="w-full h-10 px-3 rounded-xl text-sm font-sans text-text-primary bg-surface-3 border border-border outline-none placeholder:text-text-muted focus:border-primary/50 transition-colors"
                  placeholder="Repeat password"
                />
              </div>
            </div>

            {resetState?.error && (
              <p className="text-danger text-xs font-sans mt-3">{resetState.error}</p>
            )}
            {resetState?.success && (
              <p className="text-success text-xs font-sans mt-3">{resetState.success}</p>
            )}

            <Button type="submit" variant="primary" className="w-full mt-5" loading={resetPending}>
              Reset Password
            </Button>

            <button
              type="button"
              onClick={() => { setView('login'); setResetCode(''); setResetEmail(''); }}
              className="block w-full text-center text-xs text-text-muted hover:text-primary font-sans mt-4 transition-colors"
            >
              Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
