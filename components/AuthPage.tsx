'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RecoveryCodeReveal from './RecoveryCodeReveal';

type Mode = 'login' | 'signup' | 'recover';

/**
 * Sign in / create account / recover a forgotten password.
 *
 * Self-serve signup with no invite or email verification — a single-company
 * internal tool, and an email round-trip on a shared floor terminal would be
 * worse than useless. No role picker: the server assigns operator to every
 * account but the first, so signing up cannot grant the entitlement to sign
 * off batches.
 *
 * Recovery uses the account's one-time recovery code (lib/recoveryCode.ts),
 * which is shown once at signup and replaced every time it is used.
 */
export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ code: string; heading: string } | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
    setCode('');
  }

  function goToApp() {
    router.push('/');
    router.refresh();
  }

  async function post(url: string, body: unknown, failMsg: string) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => null);
    if (!res.ok) {
      setError(d?.error || failMsg);
      return null;
    }
    return d;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'recover' && password !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'recover') {
        const d = await post('/api/auth/recover', { email, code, newPassword: password }, 'Could not reset the password.');
        if (d) setReveal({ code: d.recoveryCode, heading: 'Password changed — here is your new recovery code' });
        return;
      }
      let recoveryCode: string | null = null;
      if (mode === 'signup') {
        const d = await post('/api/auth/signup', { name, email, password }, 'Could not create the account.');
        if (!d) return;
        recoveryCode = d.recoveryCode;
      }
      const signedIn = await post('/api/auth/login', { email, password }, 'Could not sign in.');
      if (!signedIn) return;
      if (recoveryCode) setReveal({ code: recoveryCode, heading: 'Account created — save your recovery code' });
      else goToApp();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (reveal) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="logo-name" style={{ fontSize: 20 }}>Formulate</div>
          <div className="logo-tag" style={{ marginBottom: 14 }}>Pro · Beta</div>
          <RecoveryCodeReveal code={reveal.code} heading={reveal.heading} onContinue={goToApp} continueLabel="Continue to Formulate" />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo-name" style={{ fontSize: 20 }}>Formulate</div>
        <div className="logo-tag" style={{ marginBottom: 14 }}>Pro · Beta</div>

        {mode === 'recover' ? (
          <div className="sub-lbl" style={{ marginBottom: 10 }}>Reset a forgotten password</div>
        ) : (
          <div className="mode-toggle">
            <button type="button" className={`m-btn${mode === 'login' ? ' active' : ''}`} onClick={() => switchMode('login')}>
              Sign in
            </button>
            <button type="button" className={`m-btn${mode === 'signup' ? ' active' : ''}`} onClick={() => switchMode('signup')}>
              Create account
            </button>
          </div>
        )}

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

        {mode === 'recover' && (
          <div className="field">
            <label htmlFor="auth-code">Recovery code</label>
            <input id="auth-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
          </div>
        )}

        <div className="field">
          <label htmlFor="auth-password">{mode === 'recover' ? 'New password' : 'Password'}</label>
          <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
        </div>

        {mode === 'recover' && (
          <div className="field">
            <label htmlFor="auth-confirm">Confirm new password</label>
            <input id="auth-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        )}

        {error && <div className="rm-inline-err">{error}</div>}

        <button type="submit" className="btn btn-p" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account and sign in' : 'Reset password and sign in'}
        </button>

        {mode === 'login' && (
          <button type="button" className="auth-link" onClick={() => switchMode('recover')}>
            Forgot password?
          </button>
        )}
        {mode === 'recover' && (
          <>
            <div className="field-hint" style={{ marginTop: 10 }}>
              Lost your recovery code too? Ask an admin for a reset link.
            </div>
            <button type="button" className="auth-link" onClick={() => switchMode('login')}>
              Back to sign in
            </button>
          </>
        )}

        {mode !== 'recover' && (
          <div className="field-hint" style={{ marginTop: 12 }}>
            Signing in is only required for GMP-mode actions. With GMP mode off the app is
            usable without an account.
          </div>
        )}
      </form>
    </div>
  );
}
