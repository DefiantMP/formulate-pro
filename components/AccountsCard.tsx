'use client';

import { useCallback, useEffect, useState } from 'react';
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';

interface Account {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface IssuedLink {
  userId: string;
  url: string;
  email: string;
  expiresAt: string;
}

/**
 * Admin-only account management: roles, reset links, deactivation.
 *
 * Non-admins see why the card is empty rather than a blank space. Every rule
 * (last admin, self-demotion, self-deactivation) is enforced server-side;
 * the disabled controls here only save a round-trip to be told no.
 */
export default function AccountsCard({ meId }: { meId: string | null }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [link, setLink] = useState<IssuedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/users')
      .then(async (res) => {
        if (res.status === 401) return setBlocked('Sign in as an admin to manage accounts.');
        if (res.status === 403) return setBlocked('Only admins can manage accounts.');
        if (!res.ok) return setBlocked('Could not load accounts.');
        setBlocked(null);
        setAccounts(await res.json());
      })
      .catch(() => setBlocked('Could not load accounts.'));
  }, []);

  useEffect(() => {
    load();
  }, [load, meId]);

  async function call(id: string, url: string, init: RequestInit, failMsg: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error || failMsg);
        return null;
      }
      return d;
    } catch {
      setError(failMsg);
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(a: Account, role: UserRole) {
    const d = await call(a.id, `/api/users/${a.id}`, { method: 'PATCH', body: JSON.stringify({ role }) }, 'Could not change the role.');
    if (d) load();
  }

  async function issueLink(a: Account) {
    const d = await call(a.id, `/api/users/${a.id}/reset-link`, { method: 'POST' }, 'Could not create a reset link.');
    if (d) {
      setCopied(false);
      setLink({ userId: a.id, url: `${window.location.origin}${d.path}`, email: d.email, expiresAt: d.expiresAt });
    }
  }

  async function deactivate(a: Account) {
    const d = await call(a.id, `/api/users/${a.id}`, { method: 'DELETE' }, 'Could not deactivate the account.');
    if (d) {
      setConfirmDeactivate(null);
      if (link?.userId === a.id) setLink(null);
      load();
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card" style={{ flexShrink: 0 }}>
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-users" />
          Accounts
        </div>
      </div>
      <div className="card-body">
        {blocked ? (
          <div className="empty">
            <i className="ti ti-lock" />
            {blocked}
          </div>
        ) : accounts === null ? (
          <div className="empty">
            <i className="ti ti-users" />
            Loading…
          </div>
        ) : (
          <>
            <div className="field-hint" style={{ marginBottom: 10 }}>
              New accounts sign up as operators. A reset link lets someone choose a new password
              — it works once, expires after an hour, and signs them out everywhere. Deactivating
              keeps the account on every record it signed; it just can no longer sign in.
            </div>

            {link && (
              <div className="rm-crit-row acct-link">
                <div className="sub-lbl">Reset link for {link.email}</div>
                <div className="field-hint" style={{ marginBottom: 8 }}>
                  Give this to them directly. It is shown only now, works once, and expires{' '}
                  {fmtDateTime(link.expiresAt)}. Creating another link cancels this one.
                </div>
                <div className="acct-link-row">
                  <input type="text" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="btn" onClick={copyLink}>
                    <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} /> {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button type="button" className="btn" onClick={() => setLink(null)}>
                    Done
                  </button>
                </div>
              </div>
            )}

            <div className="acct-row acct-row-hdr">
              <div>Account</div>
              <div>Role</div>
              <div />
            </div>
            {accounts.map((a) => {
              const isMe = a.id === meId;
              const busy = busyId === a.id;
              return (
                <div key={a.id}>
                  <div className="acct-row">
                    <div>
                      <b>{a.name}</b>
                      {isMe && <span className="acct-you">you</span>}
                      <div>{a.email}</div>
                    </div>
                    <div>
                      <select
                        value={a.role}
                        disabled={busy || isMe}
                        title={isMe ? 'You cannot change your own role' : undefined}
                        onChange={(e) => changeRole(a, e.target.value as UserRole)}
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {USER_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="acct-actions">
                      <button type="button" className="btn" disabled={busy} onClick={() => issueLink(a)}>
                        <i className="ti ti-key" /> Reset link
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || isMe}
                        title={isMe ? 'You cannot deactivate your own account' : undefined}
                        onClick={() => setConfirmDeactivate(confirmDeactivate === a.id ? null : a.id)}
                      >
                        <i className="ti ti-user-off" /> Deactivate
                      </button>
                    </div>
                  </div>
                  {confirmDeactivate === a.id && (
                    <div className="rm-crit-row" style={{ marginTop: 6 }}>
                      <div className="field-hint" style={{ marginBottom: 8 }}>
                        Deactivate <b>{a.email}</b>? They are signed out immediately and cannot sign
                        in again. Batches, weighings and log entries they signed keep their name.
                        There is no reactivate button yet.
                      </div>
                      <div className="row">
                        <button type="button" className="btn btn-p" disabled={busy} onClick={() => deactivate(a)}>
                          <i className="ti ti-check" /> {busy ? 'Working…' : 'Deactivate'}
                        </button>
                        <button type="button" className="btn" onClick={() => setConfirmDeactivate(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
        {error && <div className="rm-inline-err">{error}</div>}
      </div>
    </div>
  );
}
