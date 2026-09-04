'use client';

import { useEffect, useState } from 'react';
import type { RunRecord } from './RunHistoryPanel';
import {
  DEVIATION_DISPOSITIONS,
  DEVIATION_DISPOSITION_LABELS,
  REVIEW_STATUS_LABELS,
  outOfSpecFindings,
  type DeviationDisposition,
} from '@/lib/gmp';
import { fmt, fmtDateTime } from '@/lib/format';

interface Props {
  run: RunRecord;
  /** True when this run predates GMP mode ever being switched on. */
  grandfathered: boolean;
  gmpEnabled: boolean;
  onChanged: () => void;
}

interface Deviation {
  id: string;
  description: string;
  disposition: string;
  justification: string | null;
  openedByUser?: { name: string } | null;
  legacyOpenedBy?: string | null;
  openedAt: string;
}

/**
 * Batch QC sign-off and deviation record for one run.
 *
 * A grandfathered run shows a plain label and no controls: it was made under
 * rules that did not exist, so prompting for a review it never needed would
 * read as an outstanding task rather than history.
 */
export default function RunReviewPanel({ run, grandfathered, gmpEnabled, onChanged }: Props) {
  const [deviations, setDeviations] = useState<Deviation[] | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [devOpen, setDevOpen] = useState(false);
  const [devDescription, setDevDescription] = useState('');
  const [devFindings, setDevFindings] = useState('');
  const [devDisposition, setDevDisposition] = useState<DeviationDisposition>('pending');
  const [devJustification, setDevJustification] = useState('');

  useEffect(() => {
    fetch(`/api/runs/${run.id}/deviations`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDeviations)
      .catch(() => setDeviations([]));
  }, [run.id]);

  const findings = outOfSpecFindings({
    targetMgPerTablet: run.result.targetActiveMgPerTablet,
    actualMgPerTablet: run.actualMgPerTablet ?? null,
    targetTabletWeightG: run.result.targetWeightG,
    actualTabletWeightG: run.actualTabletWeight ?? null,
  });
  const needsDeviation = gmpEnabled && !grandfathered && findings.length > 0 && (deviations?.length ?? 0) === 0;

  async function review(status: 'approved' | 'rejected') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStatus: status, reviewNotes: notes.trim() || null }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error || 'Could not record the review.');
        return;
      }
      setNotes('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function saveDeviation() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${run.id}/deviations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: devDescription,
          investigationFindings: devFindings.trim() || null,
          disposition: devDisposition,
          justification: devJustification.trim() || null,
        }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error || 'Could not record the deviation.');
        return;
      }
      setDevOpen(false);
      setDevDescription('');
      setDevFindings('');
      setDevJustification('');
      setDevDisposition('pending');
      fetch(`/api/runs/${run.id}/deviations`).then((r) => r.json()).then(setDeviations);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="rh-detail-hdr">Batch review</div>

      {grandfathered ? (
        <div className="rule-note">
          <i className="ti ti-clock" />
          <div>
            <b>Predates GMP mode.</b> This batch was recorded before GMP mode was first
            switched on, so no review was required — it is not outstanding.
          </div>
        </div>
      ) : (
        <>
          <div className="gmp-row" style={{ paddingTop: 0 }}>
            <div>
              <div className="gmp-row-title">
                {run.reviewStatus
                  ? REVIEW_STATUS_LABELS[run.reviewStatus]
                  : gmpEnabled
                    ? 'Awaiting QC review'
                    : 'Not reviewed'}
              </div>
              <div className="gmp-row-desc">
                {run.reviewStatus && (run.reviewer?.name || run.legacyReviewerName) ? (
                  <>
                    By <b>{run.reviewer?.name ?? `${run.legacyReviewerName} (pre-accounts)`}</b>
                    {run.reviewedAt ? ` · ${fmtDateTime(run.reviewedAt)}` : ''}
                    {run.reviewNotes ? ` — ${run.reviewNotes}` : ''}
                  </>
                ) : (
                  'Sign-off is recorded against your account; only a reviewer or admin can give it.'
                )}
              </div>
            </div>
          </div>

          {run.reviewStatus !== 'approved' && (
            <>
              <div className="field">
                <label htmlFor={`rev-notes-${run.id}`}>Review notes</label>
                <input
                  id={`rev-notes-${run.id}`}
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Required when rejecting"
                />
              </div>
              <div className="row">
                <button type="button" className="btn btn-p" disabled={busy} onClick={() => review('approved')}>
                  <i className="ti ti-check" /> Approve batch
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => review('rejected')}>
                  <i className="ti ti-x" /> Reject
                </button>
              </div>
            </>
          )}
        </>
      )}

      {needsDeviation && (
        <div className="rule-note warn" style={{ marginTop: 12 }}>
          <i className="ti ti-alert-triangle" />
          <div>
            <b>Out of spec — a deviation record is required.</b>{' '}
            {findings.map((f) => `${f.parameter}: target ${fmt(f.target, 2)}, actual ${fmt(f.actual, 2)} (${f.deviationPercent >= 0 ? '+' : ''}${f.deviationPercent.toFixed(1)}%)`).join(' · ')}
          </div>
        </div>
      )}

      {deviations && deviations.length > 0 && (
        <>
          <div className="rh-detail-hdr" style={{ marginTop: 12 }}>Deviations</div>
          {deviations.map((d) => (
            <div className="rm-crit-row" key={d.id}>
              <div className="rm-crit-row-hdr">
                <div className="rm-crit-title">{d.description}</div>
                <span className="status-badge status-issue">
                  {DEVIATION_DISPOSITION_LABELS[d.disposition as DeviationDisposition] ?? d.disposition}
                </span>
              </div>
              <div className="field-hint">
                Opened by{' '}
                <b>{d.openedByUser?.name ?? (d.legacyOpenedBy ? `${d.legacyOpenedBy} (pre-accounts)` : 'unattributed')}</b>{' '}
                · {fmtDateTime(d.openedAt)}
                {d.justification && <> — {d.justification}</>}
              </div>
            </div>
          ))}
        </>
      )}

      {!grandfathered && !devOpen && (
        <button type="button" className="add-lot-btn" style={{ marginTop: 10 }} onClick={() => setDevOpen(true)}>
          <i className="ti ti-file-alert" /> Record a deviation
        </button>
      )}

      {devOpen && (
        <div className="rm-crit-row" style={{ marginTop: 10 }}>
          <div className="sub-lbl">Deviation record</div>
          <div className="field">
            <label htmlFor={`dev-desc-${run.id}`}>What happened</label>
            <input id={`dev-desc-${run.id}`} type="text" value={devDescription} onChange={(e) => setDevDescription(e.target.value)} placeholder="e.g. Assay 9% below target" />
          </div>
          <div className="field">
            <label htmlFor={`dev-find-${run.id}`}>Investigation / cause</label>
            <input id={`dev-find-${run.id}`} type="text" value={devFindings} onChange={(e) => setDevFindings(e.target.value)} placeholder="optional" />
          </div>
          <div className="field">
            <label htmlFor={`dev-disp-${run.id}`}>Disposition</label>
            <select id={`dev-disp-${run.id}`} value={devDisposition} onChange={(e) => setDevDisposition(e.target.value as DeviationDisposition)}>
              {DEVIATION_DISPOSITIONS.map((d) => (
                <option key={d} value={d}>{DEVIATION_DISPOSITION_LABELS[d]}</option>
              ))}
            </select>
          </div>
          {devDisposition === 'accept_with_justification' && (
            <div className="field">
              <label htmlFor={`dev-just-${run.id}`}>Justification</label>
              <input id={`dev-just-${run.id}`} type="text" value={devJustification} onChange={(e) => setDevJustification(e.target.value)} placeholder="Required to accept out-of-spec material" />
            </div>
          )}
          {error && <div className="rm-inline-err">{error}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-p" disabled={busy || !devDescription.trim()} onClick={saveDeviation}>
              <i className="ti ti-check" /> Save deviation
            </button>
            <button type="button" className="btn" onClick={() => setDevOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {error && !devOpen && <div className="rm-inline-err">{error}</div>}
    </div>
  );
}
