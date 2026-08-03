'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { numOrZero } from '@/lib/format';
import type { ScaleVerificationRecord, ToleranceType } from '@/lib/scaleVerification';

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
  const [ingredientLabel, setIngredientLabel] = useState('');
  const [expectedWeightG, setExpectedWeightG] = useState('');
  const [toleranceType, setToleranceType] = useState<ToleranceType>('absolute');
  const [toleranceValue, setToleranceValue] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScaleVerificationRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const canSubmit =
    !submitting &&
    ingredientLabel.trim() !== '' &&
    numOrZero(expectedWeightG) > 0 &&
    numOrZero(toleranceValue) >= 0 &&
    photoDataUrl !== null;

  async function submit() {
    if (!canSubmit || !photoDataUrl) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/scale-verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredientLabel: ingredientLabel.trim(),
          expectedWeightG: numOrZero(expectedWeightG),
          toleranceType,
          toleranceValue: numOrZero(toleranceValue),
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
    setIngredientLabel('');
    setExpectedWeightG('');
    setToleranceType('absolute');
    setToleranceValue('');
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
        <div className="sv-subtitle">Photograph a scale reading to verify it against an expected weight.</div>
      </div>

      {result ? (
        <ResultCard result={result} onSubmitAnother={submitAnother} onUpdated={setResult} />
      ) : (
        <div className="sv-card">
          <div className="field">
            <label>Ingredient / label</label>
            <input
              type="text"
              placeholder="e.g. Magnesium stearate"
              value={ingredientLabel}
              onChange={(e) => setIngredientLabel(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Expected weight</label>
            <div className="row">
              <input
                type="number"
                placeholder="0.00"
                step="0.01"
                value={expectedWeightG}
                onChange={(e) => setExpectedWeightG(e.target.value)}
              />
              <div className="unit">g</div>
            </div>
          </div>

          <div className="field">
            <label>Tolerance</label>
            <div className="sv-tolerance-toggle">
              <button
                type="button"
                className={`sv-tolerance-btn${toleranceType === 'absolute' ? ' active' : ''}`}
                onClick={() => setToleranceType('absolute')}
              >
                ± grams
              </button>
              <button
                type="button"
                className={`sv-tolerance-btn${toleranceType === 'percent' ? ' active' : ''}`}
                onClick={() => setToleranceType('percent')}
              >
                ± %
              </button>
            </div>
            <div className="row">
              <input
                type="number"
                placeholder="0.00"
                step="0.01"
                value={toleranceValue}
                onChange={(e) => setToleranceValue(e.target.value)}
              />
              <div className="unit">{toleranceType === 'percent' ? '%' : 'g'}</div>
            </div>
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

      {!result && (
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
