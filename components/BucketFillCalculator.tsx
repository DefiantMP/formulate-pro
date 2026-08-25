'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/lib/format';
import {
  calculateBucketFill,
  validateBucketFill,
  bucketFillWarnings,
  type BucketFillInput,
} from '@/lib/bucketFill';
import type { RunRecord } from './RunHistoryPanel';

interface BucketPreset {
  id: string;
  name: string;
  tareWeightG: number;
}

/** Only the fields this calculator reads off /api/saved-formulations. */
interface FormulationOption {
  id: string;
  name: string;
  version: number;
  tabletWeightG: number;
}

/**
 * Where the tablet unit weight came from. 'manual' is always available and
 * is what an override falls back to — picking a run or formulation fills
 * the field in, it never locks it, so a operator-typed figure always wins.
 */
type WeightSource = 'manual' | 'run' | 'formulation';

/** Parses a text field without numOrZero's "" -> 0 coercion, so a blank field reads as invalid rather than as zero. */
function parseField(value: string): number {
  if (!value.trim()) return NaN;
  return Number(value);
}

export default function BucketFillCalculator() {
  const [tabletCount, setTabletCount] = useState('');
  const [tabletWeightG, setTabletWeightG] = useState('');
  const [bucketWeightG, setBucketWeightG] = useState('');

  const [weightSource, setWeightSource] = useState<WeightSource>('manual');
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [formulations, setFormulations] = useState<FormulationOption[]>([]);

  const [presets, setPresets] = useState<BucketPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetError, setPresetError] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);

  useEffect(() => {
    fetch('/api/runs')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: RunRecord[]) => setRuns(data))
      .catch(() => setRuns([]));
    fetch('/api/saved-formulations')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: FormulationOption[]) => setFormulations(data))
      .catch(() => setFormulations([]));
    loadPresets();
  }, []);

  function loadPresets() {
    fetch('/api/bucket-presets')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: BucketPreset[]) => setPresets(data))
      .catch(() => setPresets([]));
  }

  const input: BucketFillInput = {
    tabletCount: parseField(tabletCount),
    tabletWeightG: parseField(tabletWeightG),
    bucketWeightG: parseField(bucketWeightG),
  };

  // Not memoized: `input` is rebuilt every render anyway, so a dependency
  // array over it would never hit, and both of these are cheap pure
  // arithmetic over three numbers.
  const errors = validateBucketFill(input);
  const warnings = bucketFillWarnings(input);
  const result = errors.length === 0 ? calculateBucketFill(input) : null;

  // Every field still untouched — show nothing rather than a wall of red on
  // a form the operator hasn't started filling in yet.
  const untouched = !tabletCount.trim() && !tabletWeightG.trim() && !bucketWeightG.trim();

  function pickRun(runId: string) {
    const run = runs.find((r) => r.id === runId);
    if (!run) return;
    // Read from result, not inputs: targetWeightG is a typed number on both
    // FreshResult and RegrindResult, where inputs is an untyped string bag.
    setTabletWeightG(String(run.result.targetWeightG));
    setWeightSource('run');
    setSourceLabel(run.label);
  }

  function pickFormulation(id: string) {
    const f = formulations.find((x) => x.id === id);
    if (!f) return;
    setTabletWeightG(String(f.tabletWeightG));
    setWeightSource('formulation');
    setSourceLabel(`${f.name} v${f.version}`);
  }

  function pickPreset(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setBucketWeightG(String(preset.tareWeightG));
  }

  async function savePreset() {
    const tare = parseField(bucketWeightG);
    if (!presetName.trim()) {
      setPresetError('Give the bucket a name.');
      return;
    }
    if (!Number.isFinite(tare) || tare <= 0) {
      setPresetError('Enter the bucket weight first.');
      return;
    }
    setSavingPreset(true);
    setPresetError(null);
    try {
      const res = await fetch('/api/bucket-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: presetName.trim(), tareWeightG: tare }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPresetError(data?.error || 'Could not save that bucket.');
        return;
      }
      setPresetName('');
      setShowSavePreset(false);
      loadPresets();
    } catch {
      setPresetError('Could not save that bucket.');
    } finally {
      setSavingPreset(false);
    }
  }

  async function deletePreset(id: string) {
    await fetch(`/api/bucket-presets/${id}`, { method: 'DELETE' }).catch(() => null);
    loadPresets();
  }

  return (
    <>
      <div className="sv-card">
        <div className="field">
          <label>Tablet count</label>
          <div className="row">
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              placeholder="0"
              value={tabletCount}
              onChange={(e) => setTabletCount(e.target.value)}
            />
            <div className="unit">tablets</div>
          </div>
        </div>

        <div className="field">
          <label>Tablet unit weight</label>
          <div className="row">
            <input
              type="number"
              step="0.0001"
              min="0"
              placeholder="0.0000"
              value={tabletWeightG}
              onChange={(e) => {
                setTabletWeightG(e.target.value);
                // Any keystroke makes this the operator's own number, not
                // the run's or the formulation's.
                setWeightSource('manual');
                setSourceLabel(null);
              }}
            />
            <div className="unit">g</div>
          </div>
          {weightSource !== 'manual' && sourceLabel && (
            <div className="bf-source-note">
              <i className="ti ti-link" /> From {weightSource === 'run' ? 'run' : 'formulation'}{' '}
              <b>{sourceLabel}</b> — type over it to override.
            </div>
          )}
          <div className="bf-source-picks">
            <select value="" onChange={(e) => e.target.value && pickRun(e.target.value)}>
              <option value="">Pull from a run…</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.label} · {fmt(run.result.targetWeightG, 4)} g
                </option>
              ))}
            </select>
            <select value="" onChange={(e) => e.target.value && pickFormulation(e.target.value)}>
              <option value="">Pull from a formulation…</option>
              {formulations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} v{f.version} · {fmt(f.tabletWeightG, 4)} g
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>Empty bucket weight</label>
          <div className="row">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={bucketWeightG}
              onChange={(e) => setBucketWeightG(e.target.value)}
            />
            <div className="unit">g</div>
          </div>
          <div className="bf-source-picks">
            <select value="" onChange={(e) => e.target.value && pickPreset(e.target.value)}>
              <option value="">{presets.length ? 'Use a saved bucket…' : 'No saved buckets yet'}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {fmt(p.tareWeightG, 2)} g
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => setShowSavePreset((v) => !v)}>
              <i className="ti ti-device-floppy" /> Save bucket
            </button>
          </div>

          {showSavePreset && (
            <div className="bf-preset-save">
              <input
                type="text"
                placeholder='Bucket name (e.g. "5-gal bucket A")'
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button type="button" className="btn btn-p" onClick={savePreset} disabled={savingPreset}>
                {savingPreset ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
          {presetError && (
            <div className="warn-row">
              <i className="ti ti-alert-triangle" /> {presetError}
            </div>
          )}
          {presets.length > 0 && (
            <div className="bf-preset-list">
              {presets.map((p) => (
                <div key={p.id} className="bf-preset-row">
                  <span>
                    {p.name} · {fmt(p.tareWeightG, 2)} g
                  </span>
                  <button type="button" onClick={() => deletePreset(p.id)} aria-label={`Delete ${p.name}`}>
                    <i className="ti ti-trash" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!untouched && errors.length > 0 && (
        <div className="sv-card">
          {errors.map((message) => (
            <div key={message} className="warn-row">
              <i className="ti ti-alert-triangle" /> {message}
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="sv-card">
          <div className="sub-lbl">Fill to this reading</div>
          <div className="bf-target">{fmt(result.targetScaleWeightG, 2)} g</div>
          <div className="bf-target-note">Untared bucket on the scale — do not zero it out.</div>

          <div className="sv-reading-row">
            <span>
              Tablets ({input.tabletCount.toLocaleString()} × {fmt(input.tabletWeightG, 4)} g)
            </span>
            <span>{fmt(result.tabletSubtotalG, 2)} g</span>
          </div>
          <div className="sv-reading-row">
            <span>Empty bucket</span>
            <span>{fmt(result.bucketWeightG, 2)} g</span>
          </div>
          <div className="sv-reading-row bf-total-row">
            <span>Target scale weight</span>
            <span>{fmt(result.targetScaleWeightG, 2)} g</span>
          </div>

          {warnings.map((message) => (
            <div key={message} className="warn-row">
              <i className="ti ti-alert-triangle" /> {message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
