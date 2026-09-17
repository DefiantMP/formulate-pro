'use client';

import { useCallback, useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import AccountsCard from './AccountsCard';
import { fmtDateTime } from '@/lib/format';
import type { LotStatusEnforcement } from '@/lib/gmp';

interface ToggleLogEntry {
  id: string;
  actorName: string;
  previousState: boolean;
  newState: boolean;
  note: string | null;
  changedAt: string;
}

export default function SettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [enforcement, setEnforcement] = useState<LotStatusEnforcement>('warn');
  const [log, setLog] = useState<ToggleLogEntry[] | null>(null);
  // The toggle is recorded against the signed-in account server-side, so the
  // page only needs to know who that is — to say so, and to block when nobody is.
  const [me, setMe] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/gmp')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!d) return;
        setEnabled(!!d.enabled);
        setEnforcement(d.lotStatusEnforcement === 'block' ? 'block' : 'warn');
        setLog(d.log ?? []);
      })
      .catch(() => setLog([]));
  }, []);

  useEffect(() => {
    load();
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, [load]);

  async function patch(body: Record<string, unknown>, failMsg: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/gmp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error || failMsg);
        return false;
      }
      load();
      return true;
    } catch {
      setError(failMsg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function confirmToggle() {
    const ok = await patch(
      { enabled: !enabled, note: note.trim() || null },
      'Failed to change GMP mode.'
    );
    if (ok) {
      setConfirming(false);
      setNote('');
    }
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">Settings</div>
          </div>
        </div>
        <div className="rh-page">
          <div className="card" style={{ flexShrink: 0 }}>
            <div className="card-hdr">
              <div className="card-hdr-title">
                <i className="ti ti-shield-check" />
                GMP mode
              </div>
            </div>
            <div className="card-body">
              <div className="rule-note">
                <i className="ti ti-info-circle" />
                <div>
                  Engineering scaffolding for 21 CFR Part 111 — not a compliance
                  certification. Turning this on enforces batch review, two-person weighing,
                  deviation records, and component identity specs on <b>new</b> work. Records
                  created before it was first switched on are never retroactively flagged, and
                  nothing is ever hidden — only blocked.
                </div>
              </div>

              <div className="gmp-row">
                <div>
                  <div className="gmp-row-title">GMP mode {enabled ? 'is ON' : 'is off'}</div>
                  <div className="gmp-row-desc">
                    {enabled
                      ? 'Part 111 checks are enforced on new runs and formulations.'
                      : 'The app behaves exactly as it does today. GMP fields stay visible but nothing is required.'}
                  </div>
                </div>
                <button
                  type="button"
                  className={`gmp-switch${enabled ? ' on' : ''}`}
                  onClick={() => setConfirming((v) => !v)}
                  disabled={saving}
                >
                  {enabled ? 'Turn off' : 'Turn on'}
                </button>
              </div>

              {confirming && (
                <div className="rm-crit-row" style={{ marginTop: 10 }}>
                  <div className="sub-lbl">
                    {enabled ? 'Turning GMP mode OFF' : 'Turning GMP mode ON'}
                  </div>
                  <div className="field-hint" style={{ marginBottom: 8 }}>
                    This is recorded permanently in the log below — who, when, and the state
                    change. The entry cannot be edited or removed afterwards.
                  </div>
                  <div className="field-hint" style={{ marginBottom: 8 }}>
                    {me ? (
                      <>
                        Recorded against your account: <b>{me.name}</b>.
                      </>
                    ) : (
                      <>
                        <b>Sign in first</b> — the change is recorded against your account, not a
                        typed name.
                      </>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="gmp-note">Reason (optional)</label>
                    <input
                      id="gmp-note"
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Preparing for audit"
                      autoFocus
                    />
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-p"
                      onClick={confirmToggle}
                      disabled={saving || !me}
                    >
                      <i className="ti ti-check" /> {saving ? 'Saving…' : 'Confirm and log'}
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirming(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="gmp-row">
                <div>
                  <div className="gmp-row-title">Non-passing lots in a run</div>
                  <div className="gmp-row-desc">
                    What happens when a run consumes a lot that failed QC or has not finished
                    testing. Only applies while GMP mode is on.
                  </div>
                </div>
                <div className="mode-toggle" style={{ margin: 0, width: 160, flexShrink: 0 }}>
                  <button
                    type="button"
                    className={`m-btn${enforcement === 'warn' ? ' active' : ''}`}
                    onClick={() => patch({ lotStatusEnforcement: 'warn' }, 'Failed to save.')}
                  >
                    Warn
                  </button>
                  <button
                    type="button"
                    className={`m-btn${enforcement === 'block' ? ' active' : ''}`}
                    onClick={() => patch({ lotStatusEnforcement: 'block' }, 'Failed to save.')}
                  >
                    Block
                  </button>
                </div>
              </div>

              {error && <div className="rm-inline-err">{error}</div>}
            </div>
          </div>

          <div className="card" style={{ flexShrink: 0 }}>
            <div className="card-hdr">
              <div className="card-hdr-title">
                <i className="ti ti-history" />
                GMP mode audit log
              </div>
            </div>
            <div className="card-body">
              <div className="field-hint" style={{ marginBottom: 10 }}>
                Append-only. Every change to the mode is recorded here and nothing in the app
                can edit or delete an entry — this log is the compliance artifact, not the
                toggle itself.
              </div>
              {log === null ? (
                <div className="empty">
                  <i className="ti ti-history" />
                  Loading…
                </div>
              ) : log.length === 0 ? (
                <div className="empty">
                  <i className="ti ti-history" />
                  GMP mode has never been turned on — every existing record predates it
                </div>
              ) : (
                <>
                  <div className="gmp-log-row" style={{ color: 'var(--text-3)', textTransform: 'uppercase', fontSize: 10 }}>
                    <div>Change</div>
                    <div>By</div>
                    <div>When</div>
                  </div>
                  {log.map((e) => (
                    <div className="gmp-log-row" key={e.id}>
                      <div>
                        <span className={`gmp-transition ${e.newState ? 'on' : 'off'}`}>
                          {e.previousState ? 'ON' : 'off'} → {e.newState ? 'ON' : 'off'}
                        </span>
                      </div>
                      <div>
                        <b>{e.actorName}</b>
                        {e.note && <div>{e.note}</div>}
                      </div>
                      <div>{fmtDateTime(e.changedAt)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <AccountsCard meId={me?.id ?? null} />
        </div>
      </div>
    </div>
  );
}
