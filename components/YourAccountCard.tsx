'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The signed-in person's own account: change password, and sign out of every
 * session. Changing the password ends other sessions but keeps this one;
 * signing out everywhere ends this one too.
 */
export default function YourAccountCard() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error || 'Could not change the password.');
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/sign-out-everywhere', { method: 'POST' });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error || 'Could not sign out everywhere.');
        return;
      }
      router.push('/sign-in');
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ flexShrink: 0 }}>
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-user" />
          Your account
        </div>
      </div>
      <div className="card-body">
        <div className="field-hint" style={{ marginBottom: 10 }}>
          You are signed out after an hour without using the app, and eight hours after signing
          in regardless.
        </div>

        <form className="acct-pw" onSubmit={changePassword}>
          <div className="sub-lbl">Change password</div>
          <div className="acct-pw-grid">
            <div className="field">
              <label htmlFor="pw-current">Current password</label>
              <input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="field">
              <label htmlFor="pw-new">New password</label>
              <input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 10 characters" autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="pw-confirm">Confirm new password</label>
              <input id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <div className="row">
            <button type="submit" className="btn btn-p" disabled={busy || !current || !next}>
              <i className="ti ti-key" /> {busy ? 'Working…' : 'Change password'}
            </button>
            {saved && <span className="field-hint">Password changed. Your other sessions have been signed out.</span>}
          </div>
        </form>

        <div className="gmp-row" style={{ marginTop: 10 }}>
          <div>
            <div className="gmp-row-title">Sign out everywhere</div>
            <div className="gmp-row-desc">
              Ends every session on your account, including this one — for a terminal you left
              signed in, or a password you think someone saw.
            </div>
          </div>
          {confirmSignOut ? (
            <div className="row" style={{ flexShrink: 0 }}>
              <button type="button" className="btn btn-p" disabled={busy} onClick={signOutEverywhere}>
                Sign out everywhere
              </button>
              <button type="button" className="btn" onClick={() => setConfirmSignOut(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn" style={{ flexShrink: 0 }} onClick={() => setConfirmSignOut(true)}>
              <i className="ti ti-logout" /> Sign out everywhere
            </button>
          )}
        </div>

        {error && <div className="rm-inline-err">{error}</div>}
      </div>
    </div>
  );
}
