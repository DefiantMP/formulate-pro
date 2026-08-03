'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ScaleVerificationRecord } from '@/lib/scaleVerification';

function ToleranceLabel({ record }: { record: ScaleVerificationRecord }) {
  return (
    <>
      ± {record.toleranceValue}
      {record.toleranceType === 'percent' ? '%' : 'g'}
    </>
  );
}

function PassFailBadge({ record }: { record: ScaleVerificationRecord }) {
  const badgeClass = record.passFail === 'pass' ? 'pass' : record.passFail === 'fail' ? 'fail' : 'unclear';
  const badgeText = record.passFail === 'pass' ? 'Pass' : record.passFail === 'fail' ? 'Fail' : 'Unreadable';
  return (
    <span className={`sv-result-badge ${badgeClass}`}>
      <i className={`ti ti-${badgeClass === 'pass' ? 'circle-check' : badgeClass === 'fail' ? 'circle-x' : 'help-circle'}`} />
      {badgeText}
    </span>
  );
}

/** True only when both readings exist and disagree — never for a one-sided null (AI unreadable, operator filled it in by hand isn't itself a "correction" of a bad AI read in the same sense). */
function wasEdited(record: ScaleVerificationRecord): boolean {
  return (
    record.aiReadingWeightG !== null &&
    record.operatorReadingWeightG !== null &&
    record.aiReadingWeightG !== record.operatorReadingWeightG
  );
}

function EditedBadge() {
  return (
    <span className="sv-confidence-badge low" title="The operator's reading differs from the AI's — double-check against the photo before approving.">
      <i className="ti ti-edit" /> Edited
    </span>
  );
}

export default function ScaleVerifyReviewPage() {
  const [pending, setPending] = useState<ScaleVerificationRecord[] | null>(null);
  const [approved, setApproved] = useState<ScaleVerificationRecord[] | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadPending() {
    fetch('/api/scale-verifications?status=pending')
      .then((res) => (res.ok ? res.json() : []))
      .then(setPending);
  }
  function loadApproved() {
    fetch('/api/scale-verifications?status=approved')
      .then((res) => (res.ok ? res.json() : []))
      .then(setApproved);
  }

  useEffect(() => {
    loadPending();
    loadApproved();
  }, []);

  async function approve(id: string) {
    setApprovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/scale-verifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to approve this verification.');
        return;
      }
      loadPending();
      loadApproved();
    } catch {
      setError('Failed to approve this verification.');
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="sv-page">
      <div className="sv-hdr">
        <div className="sv-title">Manager review queue</div>
        <div className="sv-subtitle">Approve a verification to discard its photo and keep the record.</div>
      </div>

      {error && (
        <div className="warn-row" style={{ marginBottom: 14 }}>
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      )}

      <div className="sv-card">
        <div className="sub-lbl">Pending review</div>
        {pending === null ? (
          <div className="empty">
            <i className="ti ti-clipboard-check" />
            Loading…
          </div>
        ) : pending.length === 0 ? (
          <div className="empty">
            <i className="ti ti-clipboard-check" />
            Nothing pending review
          </div>
        ) : (
          pending.map((record) => (
            <div className="sv-review-item" key={record.id}>
              {record.photoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={record.photoDataUrl} alt={`${record.ingredientLabel} scale reading`} className="sv-review-photo" />
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{record.ingredientLabel}</div>
                <PassFailBadge record={record} />
              </div>
              <div className="sv-reading-row">
                <span>Expected</span>
                <span>
                  {record.expectedWeightG.toFixed(2)} g (<ToleranceLabel record={record} />)
                </span>
              </div>
              <div className="sv-reading-row">
                <span>AI reading</span>
                <span>{record.aiReadingWeightG !== null ? `${record.aiReadingWeightG.toFixed(2)} g` : 'Not readable'}</span>
              </div>
              <div className="sv-reading-row">
                <span>Operator reading</span>
                <span>
                  {record.operatorReadingWeightG !== null ? `${record.operatorReadingWeightG.toFixed(2)} g` : 'Not entered'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span className={`sv-confidence-badge ${record.confident ? 'high' : 'low'}`}>
                  <i className={`ti ti-${record.confident ? 'eye-check' : 'eye-exclamation'}`} />
                  {record.confident ? 'Confident read' : 'Low-confidence read'}
                </span>
                {wasEdited(record) && <EditedBadge />}
              </div>
              <div className="sv-reasoning">
                <i className="ti ti-message-circle" style={{ marginRight: 5, color: 'var(--text-3)' }} />
                {record.modelNotes}
              </div>
              <div className="field-hint">{new Date(record.createdAt).toLocaleString()}</div>
              <button
                type="button"
                className="btn btn-p"
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => approve(record.id)}
                disabled={approvingId === record.id}
              >
                <i className="ti ti-check" /> {approvingId === record.id ? 'Approving…' : 'Approve'}
              </button>
            </div>
          ))
        )}
      </div>

      {approved !== null && approved.length > 0 && (
        <div className="sv-card">
          <div className="sub-lbl">Recently approved</div>
          {approved.map((record) => (
            <div className="sv-review-item" key={record.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{record.ingredientLabel}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {wasEdited(record) && <EditedBadge />}
                  <PassFailBadge record={record} />
                </div>
              </div>
              <div className="sv-reading-row">
                <span>Expected / operator reading</span>
                <span>
                  {record.expectedWeightG.toFixed(2)} g /{' '}
                  {record.operatorReadingWeightG !== null ? `${record.operatorReadingWeightG.toFixed(2)} g` : '—'}
                </span>
              </div>
              <div className="field-hint">
                Approved {record.approvedAt ? new Date(record.approvedAt).toLocaleString() : ''} · photo discarded
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <Link href="/scale-verify" className="btn">
          <i className="ti ti-arrow-left" /> New verification
        </Link>
      </div>
    </div>
  );
}
