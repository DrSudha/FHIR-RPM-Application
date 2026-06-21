'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import RpmLogoIcon from '@/components/RpmLogoIcon';
import { loginAction } from '@/app/actions/auth';
import type { AuthActionState } from '@/lib/auth/types';

const initialState: AuthActionState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="auth-page">
      <div className="auth-card glass-card">
        <div className="auth-brand">
          <div className="app-logo-mark auth-logo-mark">
            <RpmLogoIcon size={22} className="app-logo-icon" />
          </div>
          <h1>Pro Health</h1>
          <p>Remote Patient Monitoring — sign in to continue</p>
        </div>

        <form className="auth-form" action={formAction}>
          <label className="form-group">
            <span className="form-label">Email</span>
            <input
              className="form-input"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="you@prohealth.local"
              required
            />
          </label>

          <label className="form-group">
            <span className="form-label">Password</span>
            <input
              className="form-input"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />
          </label>

          {state?.error && <p className="auth-form-error">{state.error}</p>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footnote text-muted">
          First-time setup uses the admin account from server configuration. Administrators can
          create additional users under{' '}
          <Link href="/admin/users" className="auth-inline-link">
            User management
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
