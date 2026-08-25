'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { fmt, numOrZero } from '@/lib/format';
import { DEFAULT_TOLERANCE_PERCENT, type ScaleVerificationRecord } from '@/lib/scaleVerification';
import { getRunIngredientBreakdown, type RunIngredientRow } from '@/lib/runIngredientBreakdown';
import type { RunRecord } from './RunHistoryPanel';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read photo'));
    reader.readAsDataURL(file);
  });
}

export default function ScaleVerifySubmitPage() {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedIngredient, setSelectedIngredient] = useState<RunIngredientRow | null>(null);

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScaleVerificationRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/runs')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: RunRecord[]) => setRuns(data))
      .catch(() => setRunsError('Could not load saved runs. Please try again.'));
  }, []);

  const selectedRun = useMemo(() => runs?.find((r) => r.id === selectedRunId) ?? null, [runs, selectedRunId]);
  // Same derivation the run's own Output tab used when the run was
  // calculated — no recalculation here, just reading back what's already
  // stored on the run's result.
  const breakdown = useMemo(
    () => (selectedRun ? getRunIngredientBreakdown(selectedRun.mode, selectedRun.result) : []),
    [selectedRun]
  );

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Photo is too large (max 8 MB) — try again with a lower-resolution camera setting.');
      setPhotoDataUrl(null);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPhotoDataUrl(dataUrl);
    } catch {
      setPhotoError('Could not read that photo — please try again.');
      setPhotoDataUrl(null);
    }
  }

  const canSubmit = !submitting && selectedRun !== null && selectedIngredient !== null && photoDataUrl !== null;

  async function submit() {
    if (!canSubmit || !selectedRun || !selectedIngredient || !photoDataUrl) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/scale-verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: selectedRun.id,
          ingredientLabel: selectedIngredient.label,
          photoDataUrl,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Verification failed. Please try again.');
        return;
      }
      setResult(data as ScaleVerificationRecord);
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function submitAnother() {
    setSelectedRunId(null);
    setSelectedIngredient(null);
    setPhotoDataUrl(null);
    setPhotoError(null);
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="sv-page">
      <div className="sv-hdr">
        <div className="sv-title">Scale verification</div>
        <div className="sv-subtitle">Photograph a scale reading to verify it against a run&apos;s calculated expected weight.</div>
      </div>

      {result ? (
        <ResultCard result={result} onSubmitAnother={submitAnother} onUpdated={setResult} />
      ) : !selectedRun ? (
        <RunPicker runs={runs} error={runsError} onSelect={setSelectedRunId} />
      ) : !selectedIngredient ? (
        <IngredientPicker run={selectedRun} breakdown={breakdown} onSelect={setSelectedIngredient} onBack={() => setSelectedRunId(null)} />
      ) : (
        <div className="sv-card">
          <button type="button" className="sv-context-back" onClick={() => setSelectedIngredient(null)}>
            <i className="ti ti-chevron-left" /> Change ingredient
          </button>
          <div className="sv-context-line">
            <b>{selectedRun.label}</b> · {selectedRun.mode === 'fresh' ? 'Fresh Batch' : 'Regrind'}
          </div>

          <div className="field">
            <label>Verifying</label>
            <div className="sv-locked-value">{selectedIngredient.label}</div>
          </div>

          <div className="field">
            <label>Expected weight (locked to this run)</label>
            <div className="sv-locked-value">{fmt(selectedIngredient.grams, 2)} g</div>
          </div>

          <div className="field">
            <label>Tolerance (default)</label>
            <div className="sv-locked-value">± {DEFAULT_TOLERANCE_PERCENT}%</div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Scale photo</label>
            {photoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoDataUrl} alt="Scale reading preview" className="sv-photo-preview" />
            ) : null}
            <label className="sv-photo-dropzone" htmlFor="sv-photo-input">
              <i className="ti ti-camera" />
              {photoDataUrl ? 'Retake photo' : 'Tap to take or choose a photo'}
            </label>
            <input
              id="sv-photo-input"
              ref={fileInputRef}
              className="sv-photo-input-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
            />
            {photoError && (
              <div className="warn-row">
                <i className="ti ti-alert-triangle" /> {photoError}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="warn-row" style={{ marginBottom: 14 }}>
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      )}

      {!result && selectedRun && selectedIngredient && (
        <button type="button" className="btn btn-p sv-submit-btn" onClick={submit} disabled={!canSubmit}>
          {submitting ? (
            <>
              <i className="ti ti-loader-2" /> Reading scale…
            </>
          ) : (
            <>
              <i className="ti ti-check" /> Submit for verification
            </>
          )}
        </button>
      )}

      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <Link href="/scale-verify/review" className="btn">
          <i className="ti ti-clipboard-check" /> Manager review queue
        </Link>
      </div>
    </div>
  );
}

function RunPicker({
  runs,
  error,
  onSelect,
}: {
  runs: RunRecord[] | null;
  error: string | null;
  onSelect: (runId: string) => void;
}) {
  return (
    <div className="sv-card">
      <div className="sub-lbl">Select a run</div>
      {error ? (
        <div className="warn-row">
          <i className="ti ti-alert-triangle" /> {error}
        </div>
      ) : runs === null ? (
        <div className="empty">
          <i className="ti ti-history" /> Loading runs…
        </div>
      ) : runs.length === 0 ? (
        <div className="empty">
          <i className="ti ti-history" /> No saved runs yet — save a Fresh Batch or Regrind run first.
        </div>
      ) : (
        runs.map((run) => (
          <button type="button" key={run.id} className="sv-run-row" onClick={() => onSelect(run.id)}>
            <div>
              <div className="sv-run-row-label">{run.label}</div>
              <div className="sv-run-row-date">{new Date(run.createdAt).toLocaleDateString()}</div>
            </div>
            <span className={`run-tag ${run.mode === 'fresh' ? 'tag-fr' : 'tag-rg'}`}>
              {run.mode === 'fresh' ? 'Fresh' : 'Regrind'}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function IngredientPicker({
  run,
  breakdown,
  onSelect,
  onBack,
}: {
  run: RunRecord;
  breakdown: RunIngredientRow[];
  onSelect: (row: RunIngredientRow) => void;
  onBack: () => void;
}) {
  return (
    <div className="sv-card">
      <button type="button" className="sv-context-back" onClick={onBack}>
        <i className="ti ti-chevron-left" /> Change run
      </button>
      <div className="sv-context-line">
        <b>{run.label}</b> · {run.mode === 'fresh' ? 'Fresh Batch' : 'Regrind'}
      </div>
      <div className="sub-lbl" style={{ marginTop: 10 }}>
        Select the ingredient you&apos;re weighing
      </div>
      {breakdown.length === 0 ? (
        <div className="empty">
          <i className="ti ti-alert-triangle" /> No ingredient breakdown available for this run
        </div>
      ) : (
        breakdown.map((row) => (
          <button type="button" key={row.label} className="sv-ingredient-row" onClick={() => onSelect(row)}>
            <span>{row.label}</span>
            <span>{fmt(row.grams, 2)} g</span>
          </button>
        ))
      )}
    </div>
  );
}

function ResultCard({
  result,
  onSubmitAnother,
  onUpdated,
}: {
  result: ScaleVerificationRecord;
  onSubmitAnother: () => void;
  onUpdated: (updated: ScaleVerificationRecord) => void;
}) {
  const badgeClass = result.passFail === 'pass' ? 'pass' : result.passFail === 'fail' ? 'fail' : 'unclear';
  const badgeText = result.passFail === 'pass' ? 'Pass' : result.passFail === 'fail' ? 'Fail' : 'Unreadable';

  const [draftReading, setDraftReading] = useState(
    result.operatorReadingWeightG !== null ? String(result.operatorReadingWeightG) : ''
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const draftMatchesSaved =
    (result.operatorReadingWeightG === null && draftReading.trim() === '') ||
    numOrZero(draftReading) === result.operatorReadingWeightG;

  async function saveCorrection() {
    if (draftReading.trim() === '') {
      setSaveError('Enter a weight in grams.');
      return;
    }
    const parsed = Number(draftReading);
    if (!Number.isFinite(parsed)) {
      setSaveError('Enter a valid number.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/scale-verifications/${result.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorReadingWeightG: parsed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error || 'Failed to save correction.');
        return;
      }
      onUpdated(data as ScaleVerificationRecord);
    } catch {
      setSaveError('Failed to save correction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sv-card">
      {result.photoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={result.photoDataUrl} alt="Submitted scale reading" className="sv-photo-preview" />
      )}

      <div className="sv-context-line">
        Verifying <b>{result.ingredientLabel}</b> for Run: <b>{result.run?.label ?? result.runId}</b>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span className={`sv-result-badge ${badgeClass}`}>
          <i className={`ti ti-${badgeClass === 'pass' ? 'circle-check' : badgeClass === 'fail' ? 'circle-x' : 'help-circle'}`} />
          {badgeText}
        </span>
        <span className={`sv-confidence-badge ${result.confident ? 'high' : 'low'}`}>
          <i className={`ti ti-${result.confident ? 'eye-check' : 'eye-exclamation'}`} />
          {result.confident ? 'Confident read' : 'Low-confidence read'}
        </span>
      </div>

      <div className="sv-reading-row">
        <span>Expected</span>
        <span>
          {result.expectedWeightG.toFixed(2)} g (± {result.toleranceValue}
          {result.toleranceType === 'percent' ? '%' : 'g'})
        </span>
      </div>
      <div className="sv-reading-row">
        <span>AI reading</span>
        <span>{result.aiReadingWeightG !== null ? `${result.aiReadingWeightG.toFixed(2)} g` : 'Not readable'}</span>
      </div>

      <div className="field" style={{ marginTop: 8, marginBottom: 4 }}>
        <label>Your reading (correct if the AI misread the display)</label>
        <div className="row">
          <input
            type="number"
            placeholder="0.00"
            step="0.01"
            value={draftReading}
            onChange={(e) => setDraftReading(e.target.value)}
            disabled={result.status === 'approved'}
          />
          <div className="unit">g</div>
        </div>
      </div>
      {saveError && (
        <div className="warn-row" style={{ marginBottom: 8 }}>
          <i className="ti ti-alert-triangle" /> {saveError}
        </div>
      )}
      {result.status !== 'approved' && (
        <button
          type="button"
          className="btn"
          style={{ marginBottom: 10 }}
          onClick={saveCorrection}
          disabled={saving || draftMatchesSaved}
        >
          <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save reading'}
        </button>
      )}

      <div className="sv-reasoning">
        <i className="ti ti-message-circle" style={{ marginRight: 5, color: 'var(--text-3)' }} />
        {result.modelNotes}
      </div>

      <div className="warn-row" style={{ marginTop: 10 }}>
        <i className="ti ti-clock" /> Sent to the manager review queue — pending approval.
      </div>

      <button type="button" className="btn sv-submit-btn" style={{ marginTop: 12 }} onClick={onSubmitAnother}>
        <i className="ti ti-plus" /> Submit another
      </button>
    </div>
  );
}
