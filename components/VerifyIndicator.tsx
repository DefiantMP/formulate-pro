export type VerifyStatus = 'idle' | 'checking' | 'confirmed' | 'needs_review' | 'acknowledged' | 'error';

export interface VerifyDiscrepancy {
  field: string;
  reportedValue: number;
  computedValue: number;
  unit: string;
}

interface VerifyIndicatorProps {
  status: VerifyStatus;
  notes: string;
  discrepancy: VerifyDiscrepancy | null;
  onAcknowledge: () => void;
}

const QUIET_STATES: Record<'checking' | 'confirmed' | 'acknowledged' | 'error', { icon: string; text: string }> = {
  checking: { icon: 'loader-2', text: 'Checking…' },
  confirmed: { icon: 'circle-check', text: 'Verified' },
  acknowledged: { icon: 'circle-check', text: 'Reviewed — discrepancy acknowledged' },
  error: { icon: 'cloud-off', text: 'Verification unavailable' },
};

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export default function VerifyIndicator({ status, notes, discrepancy, onAcknowledge }: VerifyIndicatorProps) {
  if (status === 'idle') return null;

  if (status === 'needs_review') {
    const delta = discrepancy ? discrepancy.computedValue - discrepancy.reportedValue : null;
    return (
      <div className="verify-banner">
        <i className="ti ti-alert-triangle" />
        <div className="verify-banner-body">
          <div className="verify-banner-title">Verification disagreement — review before running this batch</div>
          {notes && <div className="verify-banner-notes">{notes}</div>}
          {discrepancy && (
            <div className="verify-compare">
              <div className="verify-compare-item">
                <div className="verify-compare-lbl">{discrepancy.field} — reported</div>
                <div className="verify-compare-val">
                  {fmtNum(discrepancy.reportedValue)} {discrepancy.unit}
                </div>
              </div>
              <div className="verify-compare-item">
                <div className="verify-compare-lbl">{discrepancy.field} — computed</div>
                <div className="verify-compare-val">
                  {fmtNum(discrepancy.computedValue)} {discrepancy.unit}
                </div>
              </div>
              <div className="verify-compare-item">
                <div className="verify-compare-lbl">Delta</div>
                <div className="verify-compare-val">
                  {delta !== null ? `${delta > 0 ? '+' : ''}${fmtNum(delta)} ${discrepancy.unit}` : '—'}
                </div>
              </div>
            </div>
          )}
          <button className="verify-ack-btn" onClick={onAcknowledge}>
            Reviewed, proceeding
          </button>
        </div>
      </div>
    );
  }

  const quiet = QUIET_STATES[status];
  const quietClass =
    status === 'confirmed' ? ' confirmed' : status === 'acknowledged' ? ' acknowledged' : '';
  return (
    <div className={`verify-quiet${quietClass}`} title={notes || undefined}>
      <i className={`ti ti-${quiet.icon}`} />
      {quiet.text}
    </div>
  );
}
