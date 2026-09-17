'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * Choose a new password from an admin-issued, one-time link. The link is
 * checked before the form shows, so a used or expired one says so up front.
 */
export default function ResetPasswordPage() {
  const token = useSearchParams().get('token') ?? '';
  const [account, setAccount] = useState<{ email: string; name: string } | null>(null);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const d = await res.json().catch(() => null);
        if (!res.ok) setLinkProblem(d?.error || 'This reset link is not valid.');
        else setAccount(d);
      })
      .catch(() => setLinkProblem('Could not reach the server.'));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error || 'Could not reset the password.');
        return;
      }
      setDone(true);
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
        <div className="logo-tag" style={{ marginBottom: 14 }}>Reset password</div>

        {done ? (
          <>
            <div className="field-hint" style={{ marginBottom: 12 }}>
              Password changed for <b>{account?.email}</b>. You have been signed out everywhere —
              sign in with the new password.
            </div>
            <Link href="/sign-in" className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
              Go to sign in
            </Link>
          </>
        ) : linkProblem ? (
          <>
            <div className="rm-inline-err" style={{ marginBottom: 12 }}>{linkProblem}</div>
            <Link href="/sign-in" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
              Back to sign in
            </Link>
          </>
        ) : !account ? (
          <div className="field-hint">Checking link…</div>
        ) : (
          <>
            <div className="field-hint" style={{ marginBottom: 10 }}>
              Choosing a new password for <b>{account.email}</b>.
            </div>
            <div className="field">
              <label htmlFor="reset-password">New password</label>
              <input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="reset-confirm">Confirm new password</label>
              <input id="reset-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div className="rm-inline-err">{error}</div>}
            <button type="submit" className="btn btn-p" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} disabled={busy || !password}>
              {busy ? 'Working…' : 'Set new password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
