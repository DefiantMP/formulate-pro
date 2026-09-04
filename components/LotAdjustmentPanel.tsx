'use client';

import { useCallback, useEffect, useState } from 'react';
import { ADJUSTMENT_REASONS, resultingQuantity } from '@/lib/lotAdjustment';
import { fmt, fmtDateTime, fmtSigned } from '@/lib/format';

interface Adjustment {
  id: string;
  deltaG: number;
  reason: string;
  adjustedBy?: { name: string } | null;
  adjustedAt: string;
}

interface Props {
  lotId: string;
  quantityRemainingG: number;
  onChanged: () => void;
}

/**
 * Stock corrections for one lot.
 *
 * Append-only by design: an adjustment cannot be edited or removed, only
 * offset by another in the opposite direction. That is stated in the UI, not
 * just enforced server-side, so an operator knows a mistake is fixed by adding
 * a correction rather than by hunting for an edit button that does not exist.
 */
export default function LotAdjustmentPanel({ lotId, quantityRemainingG, onChanged }: Props) {
  const [adjustments, setAdjustments] = useState<Adjustment[] | null>(null);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'remove' | 'add'>('remove');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/lots/${lotId}/adjustments`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setAdjustments)
      .catch(() => setAdjustments([]));
  }, [lotId]);

  useEffect(() => { load(); }, [load]);

  const magnitude = Number(amount);
  const deltaG = Number.isFinite(magnitude) ? (direction === 'remove' ? -magnitude : magnitude) : Number.NaN;
  const preview = Number.isFinite(deltaG) && amount.trim() !== ''
    ? resultingQuantity(quantityRemainingG, deltaG)
    : null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lots/${lotId}/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaG, reason: reason === '__custom' ? customReason : reason }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error || 'Could not record the adjustment.');
        return;
      }
      setOpen(false);
      setAmount('');
      setCustomReason('');
      setReason(ADJUSTMENT_REASONS[0]);
      load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="add-sub" style={{ marginTop: 16 }}>Stock adjustments</div>

      {adjustments && adjustments.length > 0 ? (
        adjustments.map((a) => (
          <div className="test-row" key={a.id}>
            <div className="test-row-main">
              <div>
                <b style={{ color: a.deltaG < 0 ? 'var(--danger-text)' : 'var(--brand)' }}>
                  {fmtSigned(a.deltaG)} g
                </b>{' '}
                — {a.reason}
              </div>
              <div className="test-row-meta">
                {fmtDateTime(a.adjustedAt)}
                {a.adjustedBy?.name ? ` · ${a.adjustedBy.name}` : ' · unattributed'}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="field-hint">No corrections recorded — remaining quantity reflects receipts and run usage only.</div>
      )}

      {!open && (
        <button type="button" className="add-lot-btn" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
          <i className="ti ti-adjustments" /> Adjust stock
        </button>
      )}

      {open && (
        <div className="rm-crit-row" style={{ marginTop: 8 }}>
          <div className="sub-lbl">Adjust remaining quantity</div>
          <div className="rule-note">
            <i className="ti ti-info-circle" />
            <div>
              Corrections are permanent and cannot be edited or deleted. A mistake here is fixed by
              recording another adjustment the other way, so the history shows what was believed and
              when it changed.
            </div>
          </div>

          <div className="mode-toggle" style={{ width: 200 }}>
            <button type="button" className={`m-btn${direction === 'remove' ? ' active' : ''}`} onClick={() => setDirection('remove')}>
              Remove
            </button>
            <button type="button" className={`m-btn${direction === 'add' ? ' active' : ''}`} onClick={() => setDirection('add')}>
              Add back
            </button>
          </div>

          <div className="field">
            <label htmlFor={`adj-amt-${lotId}`}>Amount</label>
            <div className="row">
              <input
                id={`adj-amt-${lotId}`}
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
              <div className="unit">g</div>
            </div>
            {preview !== null && (
              <div className="field-hint">
                {fmt(quantityRemainingG, 2)} g → <b>{fmt(preview, 2)} g</b> remaining
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor={`adj-reason-${lotId}`}>Reason</label>
            <select id={`adj-reason-${lotId}`} value={reason} onChange={(e) => setReason(e.target.value)}>
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="__custom">Other…</option>
            </select>
          </div>
          {reason === '__custom' && (
            <div className="field">
              <label htmlFor={`adj-custom-${lotId}`}>Describe the reason</label>
              <input id={`adj-custom-${lotId}`} type="text" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
            </div>
          )}

          {error && <div className="rm-inline-err">{error}</div>}

          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-p"
              disabled={busy || amount.trim() === '' || (reason === '__custom' && !customReason.trim())}
              onClick={submit}
            >
              <i className="ti ti-check" /> Record adjustment
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
