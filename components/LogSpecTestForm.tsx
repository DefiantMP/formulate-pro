'use client';

import { useState } from 'react';
import { criterionLimits } from './SpecEditor';
import type { SpecCriterionRecord, SpecTestType } from '@/lib/rawMaterials';
import { dateInputToIso, isoToDateInput } from '@/lib/format';

interface LogSpecTestFormProps {
  lotId: string;
  /** Active criteria only — a retired one can't take new results. */
  criteria: SpecCriterionRecord[];
  onLogged: () => void;
}

export default function LogSpecTestForm({ lotId, criteria, onLogged }: LogSpecTestFormProps) {
  const [open, setOpen] = useState(false);
  const [specCriterionId, setSpecCriterionId] = useState(criteria[0]?.id ?? '');
  const [resultValue, setResultValue] = useState('');
  const [resultText, setResultText] = useState('');
  const [passFail, setPassFail] = useState<boolean | null>(null);
  const [methodUsed, setMethodUsed] = useState('');
  const [testedBy, setTestedBy] = useState('');
  const [testedAt, setTestedAt] = useState(isoToDateInput(new Date()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const criterion = criteria.find((c) => c.id === specCriterionId) ?? criteria[0];
  const testType = (criterion?.testType as SpecTestType) ?? 'numeric_range';

  function reset() {
    setResultValue('');
    setResultText('');
    setPassFail(null);
    setMethodUsed('');
    setNotes('');
    setError(null);
  }

  function pickCriterion(id: string) {
    setSpecCriterionId(id);
    // A result entered against one parameter must not carry over to another —
    // especially the qualitative verdict, which is the tester's judgment about
    // one specific pass condition.
    reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!criterion) return;

    const body: Record<string, unknown> = {
      specCriterionId: criterion.id,
      methodUsed: methodUsed.trim() || null,
      testedBy: testedBy.trim() || null,
      testedAt: dateInputToIso(testedAt),
      notes: notes.trim() || null,
      resultText: resultText.trim() || null,
    };

    if (testType === 'numeric_range') {
      const value = Number(resultValue);
      if (!resultValue.trim() || !Number.isFinite(value)) {
        setError('A numeric result is required for this parameter.');
        return;
      }
      body.resultValue = value;
      // passFail is deliberately NOT sent: the server computes it from the
      // criterion's own limits, and ignores any client-supplied verdict.
    } else {
      if (passFail === null) {
        setError('Record a pass or fail verdict for this qualitative parameter.');
        return;
      }
      body.passFail = passFail;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/lots/${lotId}/spec-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to log this result.');
        return;
      }
      reset();
      setOpen(false);
      onLogged();
    } catch {
      setError('Failed to log this result.');
    } finally {
      setSaving(false);
    }
  }

  if (criteria.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="add-lot-btn" onClick={() => setOpen(true)}>
        <i className="ti ti-flask-2" /> Log a test result
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rm-crit-row" style={{ marginTop: 4 }}>
      <div className="sub-lbl">Log a test result</div>

      <div className="field">
        <label htmlFor="test-criterion">Parameter</label>
        <select
          id="test-criterion"
          value={criterion?.id ?? ''}
          onChange={(e) => pickCriterion(e.target.value)}
        >
          {criteria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parameterName}
            </option>
          ))}
        </select>
        {criterion && <div className="field-hint">{criterionLimits(criterion)}</div>}
      </div>

      {testType === 'numeric_range' ? (
        <>
          <div className="field">
            <label htmlFor="test-value">Measured result</label>
            <input
              id="test-value"
              type="number"
              step="any"
              value={resultValue}
              onChange={(e) => setResultValue(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="rule-note">
            <i className="ti ti-calculator" />
            <div>
              Pass or fail is computed from the limits above when this is saved — it isn’t yours to
              set. You record what was measured; the spec decides whether it conforms.
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="test-text">Observed result</label>
            <textarea
              id="test-text"
              className="rm-textarea"
              value={resultText}
              onChange={(e) => setResultText(e.target.value)}
              placeholder="What was observed"
            />
          </div>
          <div className="field">
            <label>Verdict</label>
            <div className="rh-passfail">
              <button
                type="button"
                className={`rh-pf-btn pass${passFail === true ? ' active' : ''}`}
                onClick={() => setPassFail(true)}
              >
                Conforms — pass
              </button>
              <button
                type="button"
                className={`rh-pf-btn fail${passFail === false ? ' active' : ''}`}
                onClick={() => setPassFail(false)}
              >
                Does not conform — fail
              </button>
            </div>
            <div className="field-hint">
              A qualitative parameter has nothing to compute against, so this is your judgment
              against the pass condition. It starts unset on purpose — there is no default.
            </div>
          </div>
        </>
      )}

      <div className="rm-form-grid">
        <div className="field">
          <label htmlFor="test-date">Tested on</label>
          <input
            id="test-date"
            type="date"
            value={testedAt}
            onChange={(e) => setTestedAt(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="test-by">Tested by</label>
          <input
            id="test-by"
            type="text"
            value={testedBy}
            onChange={(e) => setTestedBy(e.target.value)}
            placeholder="optional"
          />
        </div>
        <div className="field">
          <label htmlFor="test-method">Method</label>
          <input
            id="test-method"
            type="text"
            value={methodUsed}
            onChange={(e) => setMethodUsed(e.target.value)}
            placeholder="optional"
          />
        </div>
      </div>

      {testType === 'numeric_range' && (
        <div className="field">
          <label htmlFor="test-observed">Observed notes</label>
          <input
            id="test-observed"
            type="text"
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            placeholder="optional — free-text alongside the measured value"
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="test-notes">Notes</label>
        <textarea
          id="test-notes"
          className="rm-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="optional"
        />
      </div>

      <div className="rule-note warn">
        <i className="ti ti-alert-triangle" />
        <div>
          A failing result is <b>sticky</b>. Logging a later passing result for the same parameter
          does not clear it — only an approved OOS investigation concluding “invalidate original
          result” can.
        </div>
      </div>

      {error && <div className="rm-inline-err">{error}</div>}

      <div className="row" style={{ marginTop: 10 }}>
        <button type="submit" className="btn btn-p" disabled={saving}>
          <i className="ti ti-check" /> {saving ? 'Saving…' : 'Log result'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
