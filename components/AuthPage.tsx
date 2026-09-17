'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Sign in / create account.
 *
 * Self-serve signup with no invite or email verification — a single-company
 * internal tool, and an email round-trip on a shared floor terminal would be
 * worse than useless. No role picker: the server assigns operator to every
 * account but the first, so signing up cannot grant the entitlement to sign
 * off batches.
 */
export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) {
          setError((await res.json().catch(() => null))?.error || 'Could not create the account.');
          return;
        }
      }
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error || 'Could not sign in.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo-name" style={{ fontSize: 20 }}>Formulate</div>
        <div className="logo-tag" style={{ marginBottom: 14 }}>Pro · Beta</div>

        <div className="mode-toggle">
          <button
            type="button"
            className={`m-btn${mode === 'login' ? ' active' : ''}`}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`m-btn${mode === 'signup' ? ' active' : ''}`}
            onClick={() => setMode('signup')}
          >
            Create account
          </button>
        </div>

        {mode === 'signup' && (
          <>
            <div className="field">
              <label htmlFor="auth-name">Name</label>
              <input id="auth-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name or initials" />
            </div>
            <div className="field-hint" style={{ marginBottom: 10 }}>
              New accounts are for operators only. Only an admin can grant the reviewer role.
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
        </div>

        {error && <div className="rm-inline-err">{error}</div>}
        {mode === 'login' && (
          <div className="field-hint" style={{ marginTop: 6 }}>
            Forgot your password? Ask an admin for a reset link.
          </div>
        )}

        <button type="submit" className="btn btn-p" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account and sign in'}
        </button>

        <div className="field-hint" style={{ marginTop: 12 }}>
          Signing in is only required for GMP-mode actions. With GMP mode off the app is
          usable without an account.
        </div>
      </form>
    </div>
  );
}
