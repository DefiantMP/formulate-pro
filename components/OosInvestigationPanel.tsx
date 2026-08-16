'use client';

import { useState } from 'react';
import {
  OOS_DISPOSITIONS,
  OOS_DISPOSITION_EFFECTS,
  OOS_DISPOSITION_LABELS,
  isInvalidatingInvestigation,
  type OosDisposition,
} from '@/lib/lotSpecStatus';
import type { LotSpecTestRecord, OosInvestigationRecord } from '@/lib/rawMaterials';
import { fmtDate, fmtDateTime } from '@/lib/format';

/** An investigation's standing, for the badge. 'cleared' is the only one that
 *  changed anything about the failure. */
function standing(inv: OosInvestigationRecord): 'open' | 'approved' | 'cleared' {
  if (inv.approvedAt === null) return 'open';
  return isInvalidatingInvestigation({
    disposition: inv.disposition,
    approvedBy: inv.approvedBy,
    approvedAt: new Date(inv.approvedAt),
  })
    ? 'cleared'
    : 'approved';
}

function ApprovedInvestigation({ inv }: { inv: OosInvestigationRecord }) {
  const state = standing(inv);
  return (
    <div className="oos-block">
      <div className="oos-hdr">
        <div className="oos-hdr-title">
          <i className="ti ti-file-check" />
          OOS investigation
        </div>
        <span className={`oos-badge ${state}`}>
          {state === 'cleared' ? 'Approved — failure set aside' : 'Approved — failure stands'}
        </span>
      </div>
      <div className="oos-body">
        <div className="oos-meta">
          <div>
            Disposition:{' '}
            <b>
              {OOS_DISPOSITION_LABELS[inv.disposition as OosDisposition] ?? inv.disposition}
            </b>
          </div>
          <div>
            Opened by <b>{inv.openedBy}</b> on {fmtDate(inv.openedAt)} · approved by{' '}
            <b>{inv.approvedBy}</b> on {inv.approvedAt ? fmtDateTime(inv.approvedAt) : '—'}
          </div>
          <div style={{ marginTop: 6 }}>
            Reason: {inv.reasonForInvestigation}
          </div>
          {inv.rootCauseFindings && <div>Root cause: {inv.rootCauseFindings}</div>}
          {inv.retestJustified !== null && (
            <div>Retest justified: <b>{inv.retestJustified ? 'Yes' : 'No'}</b></div>
          )}
          {inv.notes && <div>Notes: {inv.notes}</div>}
        </div>
        <div className="rule-note" style={{ marginTop: 10, marginBottom: 0 }}>
          <i className="ti ti-lock" />
          <div>
            This investigation is closed and can no longer be edited. Reopening the question means
            opening a <b>new</b> investigation against the same failing result.
          </div>
        </div>
      </div>
    </div>
  );
}

interface OpenInvestigationFormProps {
  lotId: string;
  testId: string;
  onDone: () => void;
  onCancel: () => void;
}

function OpenInvestigationForm({ lotId, testId, onDone, onCancel }: OpenInvestigationFormProps) {
  const [openedBy, setOpenedBy] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/oos-investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotId,
          failedLotSpecTestId: testId,
          openedBy,
          reasonForInvestigation: reason,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to open this investigation.');
        return;
      }
      onDone();
    } catch {
      setError('Failed to open this investigation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="oos-block" onSubmit={submit}>
      <div className="oos-hdr">
        <div className="oos-hdr-title">
          <i className="ti ti-file-alert" />
          Open an OOS investigation
        </div>
      </div>
      <div className="oos-body">
        <div className="field">
          <label htmlFor={`oos-by-${testId}`}>Opened by</label>
          <input
            id={`oos-by-${testId}`}
            type="text"
            value={openedBy}
            onChange={(e) => setOpenedBy(e.target.value)}
            placeholder="Your name"
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor={`oos-reason-${testId}`}>Reason for investigation</label>
          <textarea
            id={`oos-reason-${testId}`}
            className="rm-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What triggered this — the out-of-spec result and any immediate context"
          />
        </div>
        <div className="field">
          <label htmlFor={`oos-notes-${testId}`}>Notes</label>
          <textarea
            id={`oos-notes-${testId}`}
            className="rm-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </div>
        <div className="field-hint">
          Opening an investigation changes nothing about the lot’s status. It stays failed until —
          and unless — an investigation is dispositioned and approved.
        </div>
        {error && <div className="rm-inline-err">{error}</div>}
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="submit"
            className="btn btn-p"
            disabled={saving || !openedBy.trim() || !reason.trim()}
          >
            <i className="ti ti-check" /> {saving ? 'Opening…' : 'Open investigation'}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

interface WorkInvestigationFormProps {
  inv: OosInvestigationRecord;
  onChanged: () => void;
}

function WorkInvestigationForm({ inv, onChanged }: WorkInvestigationFormProps) {
  const [rootCauseFindings, setRootCauseFindings] = useState(inv.rootCauseFindings ?? '');
  const [retestJustified, setRetestJustified] = useState<boolean | null>(inv.retestJustified);
  const [disposition, setDisposition] = useState<OosDisposition>(
    (inv.disposition as OosDisposition) ?? 'pending'
  );
  const [notes, setNotes] = useState(inv.notes ?? '');
  const [approvedBy, setApprovedBy] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Every pending edit rides along with the approval. Approval is terminal,
   *  so anything left unsaved at that moment could never be written after. */
  function currentEdits() {
    return {
      rootCauseFindings: rootCauseFindings.trim() || null,
      retestJustified,
      disposition,
      notes: notes.trim() || null,
    };
  }

  async function patch(body: Record<string, unknown>, failureMessage: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/oos-investigations/${inv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || failureMessage);
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError(failureMessage);
      return false;
    } finally {
      setSaving(false);
    }
  }

  const canApprove = disposition !== 'pending' && rootCauseFindings.trim().length > 0;
  const willClear = disposition === 'invalidate_original_result';

  return (
    <div className="oos-block">
      <div className="oos-hdr">
        <div className="oos-hdr-title">
          <i className="ti ti-file-alert" />
          OOS investigation
        </div>
        <span className="oos-badge open">Open</span>
      </div>
      <div className="oos-body">
        <div className="oos-meta" style={{ marginBottom: 10 }}>
          <div>
            Opened by <b>{inv.openedBy}</b> on {fmtDate(inv.openedAt)}
          </div>
          <div>Reason: {inv.reasonForInvestigation}</div>
        </div>

        <div className="field">
          <label htmlFor={`oos-root-${inv.id}`}>Root cause findings</label>
          <textarea
            id={`oos-root-${inv.id}`}
            className="rm-textarea"
            value={rootCauseFindings}
            onChange={(e) => setRootCauseFindings(e.target.value)}
            placeholder="What the investigation established"
          />
          <div className="field-hint">Required before this can be approved.</div>
        </div>

        <div className="field">
          <label>Retest justified?</label>
          <div className="rh-passfail">
            <button
              type="button"
              className={`rh-pf-btn pass${retestJustified === true ? ' active' : ''}`}
              onClick={() => setRetestJustified(true)}
            >
              Yes
            </button>
            <button
              type="button"
              className={`rh-pf-btn fail${retestJustified === false ? ' active' : ''}`}
              onClick={() => setRetestJustified(false)}
            >
              No
            </button>
            <button
              type="button"
              className={`rh-pf-btn${retestJustified === null ? ' active' : ''}`}
              onClick={() => setRetestJustified(null)}
            >
              Undecided
            </button>
          </div>
          <div className="field-hint">
            Whether a retest is scientifically warranted — separate from the disposition. Justifying
            a retest does not by itself invalidate the original result.
          </div>
        </div>

        <div className="field">
          <label htmlFor={`oos-disp-${inv.id}`}>Disposition</label>
          <select
            id={`oos-disp-${inv.id}`}
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as OosDisposition)}
          >
            {OOS_DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {OOS_DISPOSITION_LABELS[d]}
              </option>
            ))}
          </select>
          <div className={`rule-note${willClear ? ' warn' : ''}`} style={{ marginTop: 8 }}>
            <i className="ti ti-info-circle" />
            <div>{OOS_DISPOSITION_EFFECTS[disposition]}</div>
          </div>
        </div>

        <div className="field">
          <label htmlFor={`oos-wnotes-${inv.id}`}>Notes</label>
          <textarea
            id={`oos-wnotes-${inv.id}`}
            className="rm-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </div>

        {error && <div className="rm-inline-err">{error}</div>}

        {!confirming ? (
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => patch(currentEdits(), 'Failed to save this investigation.')}
              disabled={saving}
            >
              <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save progress'}
            </button>
            <button
              type="button"
              className="oos-approve-btn"
              onClick={() => setConfirming(true)}
              disabled={saving || !canApprove}
              title={
                canApprove
                  ? undefined
                  : 'Record root cause findings and pick a disposition other than “Undecided” first.'
              }
            >
              <i className="ti ti-writing-sign" /> Approve investigation…
            </button>
          </div>
        ) : (
          <div className="rule-note danger" style={{ marginTop: 12, display: 'block' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              <i className="ti ti-alert-triangle" /> Approval is final
            </div>
            <div style={{ marginBottom: 8 }}>
              Approving closes this investigation permanently. It cannot be edited, unapproved, or
              reopened afterwards — a further review means opening a new investigation against the
              same failing result.
            </div>
            <div style={{ marginBottom: 8 }}>
              Approving as <b>{OOS_DISPOSITION_LABELS[disposition]}</b>:{' '}
              {OOS_DISPOSITION_EFFECTS[disposition]}
            </div>
            {!willClear && (
              <div style={{ marginBottom: 8 }}>
                <b>
                  This will not clear the failure. Only an approved “invalidate original result”
                  investigation can.
                </b>
              </div>
            )}
            <div className="field">
              <label htmlFor={`oos-approver-${inv.id}`}>Approved by</label>
              <input
                id={`oos-approver-${inv.id}`}
                type="text"
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
              <div className="field-hint">
                The approval timestamp is recorded by the system at the moment you confirm.
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="oos-approve-btn"
                disabled={saving || !approvedBy.trim()}
                onClick={() =>
                  patch(
                    { ...currentEdits(), approvedBy },
                    'Failed to approve this investigation.'
                  )
                }
              >
                <i className="ti ti-check" />{' '}
                {saving ? 'Approving…' : 'Confirm — approve permanently'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setConfirming(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface OosInvestigationPanelProps {
  lotId: string;
  test: LotSpecTestRecord;
  onChanged: () => void;
}

/** The OOS flow for one failed result: any investigations already on it, plus
 *  whichever action is available next. */
export default function OosInvestigationPanel({
  lotId,
  test,
  onChanged,
}: OosInvestigationPanelProps) {
  const [opening, setOpening] = useState(false);

  const investigations = test.oosInvestigations;
  const openOne = investigations.find((i) => i.approvedAt === null);
  const approved = investigations.filter((i) => i.approvedAt !== null);
  const cleared = approved.some((i) => standing(i) === 'cleared');

  return (
    <>
      {approved.map((inv) => (
        <ApprovedInvestigation key={inv.id} inv={inv} />
      ))}

      {openOne && <WorkInvestigationForm inv={openOne} onChanged={onChanged} />}

      {!openOne && !cleared && !opening && (
        <button
          type="button"
          className="add-lot-btn"
          style={{ marginTop: 8 }}
          onClick={() => setOpening(true)}
        >
          <i className="ti ti-file-alert" />
          {approved.length > 0 ? 'Open another investigation' : 'Open an OOS investigation'}
        </button>
      )}

      {!openOne && !cleared && opening && (
        <OpenInvestigationForm
          lotId={lotId}
          testId={test.id}
          onDone={() => {
            setOpening(false);
            onChanged();
          }}
          onCancel={() => setOpening(false)}
        />
      )}
    </>
  );
}
