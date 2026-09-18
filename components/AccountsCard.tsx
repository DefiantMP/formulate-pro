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
  deletedAt: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  issuedBy: { name: string };
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
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'operator' | 'reviewer'>('operator');
  const [inviteLink, setInviteLink] = useState<{ url: string; email: string; role: string; expiresAt: string } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const load = useCallback(() => {
    fetch('/api/users?include=deactivated')
      .then(async (res) => {
        if (res.status === 401) return setBlocked('Sign in as an admin to manage accounts.');
        if (res.status === 403) return setBlocked('Only admins can manage accounts.');
        if (!res.ok) return setBlocked('Could not load accounts.');
        setBlocked(null);
        setAccounts(await res.json());
        fetch('/api/invites')
          .then((r) => (r.ok ? r.json() : []))
          .then(setInvites)
          .catch(() => setInvites([]));
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

  async function reactivate(a: Account) {
    const d = await call(a.id, `/api/users/${a.id}/reactivate`, { method: 'POST' }, 'Could not reactivate the account.');
    if (d) load();
  }

  async function createInvite() {
    const d = await call(
      'invite',
      '/api/invites',
      { method: 'POST', body: JSON.stringify({ email: inviteEmail, role: inviteRole }) },
      'Could not create the invite.'
    );
    if (d) {
      setInviteCopied(false);
      setInviteLink({ url: `${window.location.origin}${d.path}`, email: d.email, role: d.role, expiresAt: d.expiresAt });
      setInviteEmail('');
      load();
    }
  }

  async function cancelInvite(id: string) {
    const d = await call(id, `/api/invites/${id}`, { method: 'DELETE' }, 'Could not cancel the invite.');
    if (d) {
      if (inviteLink && invites.find((i) => i.id === id)?.email === inviteLink.email) setInviteLink(null);
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
              A reset link lets someone choose a new password
              — it works once, expires after an hour, and signs them out everywhere. Deactivating
              keeps the account on every record it signed; it just can no longer sign in.
            </div>

            <div className="rm-crit-row acct-invite">
              <div className="sub-lbl">Invite someone</div>
              <div className="field-hint" style={{ marginBottom: 8 }}>
                Accounts are by invitation. The link works once, only for that email, and expires in 7 days.
              </div>
              <div className="acct-invite-row">
                <input
                  type="text"
                  placeholder="their@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'operator' | 'reviewer')}>
                  <option value="operator">Operator</option>
                  <option value="reviewer">Reviewer</option>
                </select>
                <button type="button" className="btn btn-p" onClick={createInvite} disabled={busyId === 'invite' || !inviteEmail.trim()}>
                  <i className="ti ti-send" /> {busyId === 'invite' ? 'Creating…' : 'Create invite link'}
                </button>
              </div>
              {inviteLink && (
                <div style={{ marginTop: 10 }}>
                  <div className="field-hint" style={{ marginBottom: 6 }}>
                    Invite for <b>{inviteLink.email}</b> as {inviteLink.role}. Send them this link — it is shown only now
                    and expires {fmtDateTime(inviteLink.expiresAt)}.
                  </div>
                  <div className="acct-link-row">
                    <input type="text" readOnly value={inviteLink.url} onFocus={(e) => e.currentTarget.select()} />
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteLink.url);
                          setInviteCopied(true);
                        } catch {
                          setInviteCopied(false);
                        }
                      }}
                    >
                      <i className={`ti ${inviteCopied ? 'ti-check' : 'ti-copy'}`} /> {inviteCopied ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" className="btn" onClick={() => setInviteLink(null)}>
                      Done
                    </button>
                  </div>
                </div>
              )}
              {invites.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="sub-lbl">Waiting to be used</div>
                  {invites.map((i) => (
                    <div className="acct-invite-pending" key={i.id}>
                      <div>
                        <b>{i.email}</b> · {i.role} · expires {fmtDateTime(i.expiresAt)}
                      </div>
                      <button type="button" className="btn btn-sm" disabled={busyId === i.id} onClick={() => cancelInvite(i.id)}>
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
            {accounts.filter((a) => !a.deletedAt).map((a) => {
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
                        An admin can reactivate them later.
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

            {accounts.some((a) => a.deletedAt) && (
              <>
                <div className="sub-lbl" style={{ marginTop: 16 }}>Deactivated</div>
                <div className="field-hint" style={{ marginBottom: 4 }}>
                  Cannot sign in. Reactivating restores the role shown; they sign in again with
                  their existing password, or you can give them a reset link afterwards.
                </div>
                {accounts
                  .filter((a) => a.deletedAt)
                  .map((a) => (
                    <div className="acct-row acct-row-off" key={a.id}>
                      <div>
                        <b>{a.name}</b>
                        <div>{a.email}</div>
                      </div>
                      <div>
                        {USER_ROLE_LABELS[a.role as UserRole] ?? a.role}
                        <div>since {fmtDateTime(a.deletedAt!)}</div>
                      </div>
                      <div className="acct-actions">
                        <button type="button" className="btn" disabled={busyId === a.id} onClick={() => reactivate(a)}>
                          <i className="ti ti-user-check" /> {busyId === a.id ? 'Working…' : 'Reactivate'}
                        </button>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </>
        )}
        {error && <div className="rm-inline-err">{error}</div>}
      </div>
    </div>
  );
}
