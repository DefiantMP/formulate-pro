'use client';

import { useState } from 'react';
import type { ActiveDraft } from './FormulationBuilderPage';
import type { SavedFormulationDerived } from '@/lib/savedFormulations';
import { findKnownActiveMatch, knownActiveToSuggestion, type FormulationSuggestion } from '@/lib/knownActives';
import { numOrZero, fmt } from '@/lib/format';

interface GuidedFormulationWizardProps {
  name: string;
  setName: (v: string) => void;
  tabletWeightG: string;
  setTabletWeightG: (v: string) => void;
  referenceBatchTablets: string;
  setReferenceBatchTablets: (v: string) => void;
  /** Precomputed from this app's own saved formulations/runs — null when there's no data yet to draw a range from. */
  tabletWeightHint: string | null;
  actives: ActiveDraft[];
  updateActive: (id: string, patch: Partial<ActiveDraft>) => void;
  addActive: () => void;
  removeActive: (id: string) => void;
  fillerName: string;
  setFillerName: (v: string) => void;
  disintegrantName: string;
  setDisintegrantName: (v: string) => void;
  disintegrantPercent: string;
  setDisintegrantPercent: (v: string) => void;
  lubricantName: string;
  setLubricantName: (v: string) => void;
  lubricantPercent: string;
  setLubricantPercent: (v: string) => void;
  glidantName: string;
  setGlidantName: (v: string) => void;
  glidantPercent: string;
  setGlidantPercent: (v: string) => void;
  derived: SavedFormulationDerived;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
}

const STEPS = ['Basics', 'Active(s)', 'Filler', 'Excipients', 'Review'] as const;

interface AiSuggestionState {
  status: 'loading' | 'error' | 'done';
  result?: FormulationSuggestion;
  error?: string;
}

/**
 * Step-by-step alternate input UI for the same draft state FormulationBuilderPage
 * already lifted for Quick Entry — this component owns no formulation data itself,
 * only which step is showing plus this-session-only smart-suggestion UI state
 * (aiSuggestions/resolvedFor below). Save still goes through the parent's
 * unchanged save()/POST flow, so a Guided-mode draft and a Quick Entry draft
 * with the same field values produce an identical saved row.
 */
export default function GuidedFormulationWizard(props: GuidedFormulationWizardProps) {
  const {
    name,
    setName,
    tabletWeightG,
    setTabletWeightG,
    referenceBatchTablets,
    setReferenceBatchTablets,
    tabletWeightHint,
    actives,
    updateActive,
    addActive,
    removeActive,
    fillerName,
    setFillerName,
    disintegrantName,
    setDisintegrantName,
    disintegrantPercent,
    setDisintegrantPercent,
    lubricantName,
    setLubricantName,
    lubricantPercent,
    setLubricantPercent,
    glidantName,
    setGlidantName,
    glidantPercent,
    setGlidantPercent,
    derived,
    canSave,
    saving,
    onSave,
  } = props;

  const [step, setStep] = useState(0);
  const [tabletWeightUnit, setTabletWeightUnit] = useState<'g' | 'mg'>('g');

  // Smart suggestions (per active id, keyed off this session's draft ids —
  // never persisted). aiSuggestions holds the AI tier's request state;
  // resolvedFor records the active's label text at the moment its
  // suggestion panel was applied or dismissed, so the panel silently
  // reappears if the user changes the label again but stays hidden
  // otherwise. The known-table tier needs none of this — it's just a pure
  // lookup recomputed on every render.
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AiSuggestionState>>({});
  const [resolvedFor, setResolvedFor] = useState<Record<string, string>>({});

  const stepValid = [
    name.trim() !== '' && numOrZero(tabletWeightG) > 0 && numOrZero(referenceBatchTablets) > 0,
    actives.every((a) => a.label.trim() !== '' && numOrZero(a.targetMgPerTablet) > 0 && numOrZero(a.potencyPercent) > 0),
    fillerName.trim() !== '',
    true,
    canSave,
  ];

  function goTo(index: number) {
    if (index <= step) setStep(index);
  }
  function next() {
    if (stepValid[step] && step < STEPS.length - 1) setStep(step + 1);
  }
  function back() {
    if (step > 0) setStep(step - 1);
  }

  const tabletWeightDisplay =
    tabletWeightUnit === 'g' ? tabletWeightG : tabletWeightG === '' ? '' : String(numOrZero(tabletWeightG) * 1000);
  function handleTabletWeightChange(raw: string) {
    if (tabletWeightUnit === 'g') {
      setTabletWeightG(raw);
    } else {
      setTabletWeightG(raw === '' ? '' : String(numOrZero(raw) / 1000));
    }
  }

  async function requestAiSuggestion(activeId: string, label: string) {
    setAiSuggestions((prev) => ({ ...prev, [activeId]: { status: 'loading' } }));
    try {
      const res = await fetch('/api/active-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeLabel: label }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setAiSuggestions((prev) => ({
          ...prev,
          [activeId]: { status: 'error', error: data?.error || 'AI suggestion failed.' },
        }));
        return;
      }
      setAiSuggestions((prev) => ({ ...prev, [activeId]: { status: 'done', result: data as FormulationSuggestion } }));
    } catch {
      setAiSuggestions((prev) => ({
        ...prev,
        [activeId]: { status: 'error', error: 'AI suggestion failed — check your connection and try again.' },
      }));
    }
  }

  // Applies this active's own mg/tablet + potency unconditionally (that's
  // what was explicitly asked for), but only fills the shared/global fields
  // (tablet weight, disintegrant/lubricant/glidant %) where they're still
  // blank — never clobbers a value the user already entered elsewhere in
  // the wizard. Glidant name has no suggested value of its own (percentages
  // are standardized, specific product names aren't), so applying a glidant
  // % into a blank name field pairs it with Silicon Dioxide, overwhelmingly
  // the conventional glidant choice.
  function applySuggestion(activeId: string, label: string, s: FormulationSuggestion) {
    updateActive(activeId, {
      targetMgPerTablet: String(s.targetMgPerTablet),
      potencyPercent: String(s.potencyPercent),
    });
    if (tabletWeightG.trim() === '') setTabletWeightG(String(s.tabletWeightG));
    if (disintegrantPercent.trim() === '') setDisintegrantPercent(String(s.disintegrantPercent));
    if (lubricantPercent.trim() === '') setLubricantPercent(String(s.lubricantPercent));
    if (glidantName.trim() === '') setGlidantName('Silicon Dioxide');
    if (glidantPercent.trim() === '') setGlidantPercent(String(s.glidantPercent));
    setResolvedFor((prev) => ({ ...prev, [activeId]: label }));
  }

  function dismissSuggestion(activeId: string, label: string) {
    setResolvedFor((prev) => ({ ...prev, [activeId]: label }));
  }

  return (
    <div className="wizard-shell">
      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i === STEPS.length - 1 ? 'none' : 1 }}>
            <button
              type="button"
              className={`wizard-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
              onClick={() => goTo(i)}
              disabled={i > step}
            >
              <span className="wizard-step-num">{i < step ? <i className="ti ti-check" /> : i + 1}</span>
              {label}
            </button>
            {i < STEPS.length - 1 && <div className="wizard-step-connector" />}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-body">
          {step === 0 && (
            <>
              <div className="wizard-guidance">
                <i className="ti ti-info-circle" />
                <span>
                  {tabletWeightHint ??
                    "As you save more formulations, this'll show the typical tablet weight range from your own library."}
                </span>
              </div>
              <div className="field">
                <label>Formulation name</label>
                <input type="text" placeholder="e.g. RR8" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Target tablet weight</label>
                <div className="row">
                  <input
                    type="number"
                    placeholder="0.00"
                    step={tabletWeightUnit === 'g' ? '0.001' : '1'}
                    value={tabletWeightDisplay}
                    onChange={(e) => handleTabletWeightChange(e.target.value)}
                  />
                  <div className="mode-toggle" style={{ margin: 0, width: 96 }}>
                    <button
                      type="button"
                      className={`m-btn${tabletWeightUnit === 'g' ? ' active' : ''}`}
                      onClick={() => setTabletWeightUnit('g')}
                    >
                      g
                    </button>
                    <button
                      type="button"
                      className={`m-btn${tabletWeightUnit === 'mg' ? ' active' : ''}`}
                      onClick={() => setTabletWeightUnit('mg')}
                    >
                      mg
                    </button>
                  </div>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Reference batch size</label>
                <div className="row">
                  <input
                    type="number"
                    placeholder="10000"
                    step="1"
                    value={referenceBatchTablets}
                    onChange={(e) => setReferenceBatchTablets(e.target.value)}
                  />
                  <div className="unit">tablets</div>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="wizard-guidance">
                <i className="ti ti-info-circle" />
                <span>
                  Raw material potency is how much active is actually in the raw material (e.g. 76% potent means 760mg
                  active per 1000mg of powder) — we use it together with your target mg/tablet to work out how much raw
                  material each tablet needs.
                </span>
              </div>
              {actives.map((a, index) => {
                const trimmedLabel = a.label.trim();
                const knownMatch = findKnownActiveMatch(trimmedLabel);
                const aiState = aiSuggestions[a.id];
                const dismissedForCurrentLabel = resolvedFor[a.id] === trimmedLabel;

                const suggestion: FormulationSuggestion | null = knownMatch
                  ? knownActiveToSuggestion(knownMatch)
                  : aiState?.status === 'done' && aiState.result
                    ? aiState.result
                    : null;

                const showSuggestionPanel = !!suggestion && !dismissedForCurrentLabel;
                const showAiTrigger = !knownMatch && trimmedLabel.length >= 3 && !dismissedForCurrentLabel && !aiState;
                const showAiLoading = !knownMatch && aiState?.status === 'loading';
                const showAiError = !knownMatch && aiState?.status === 'error' && !dismissedForCurrentLabel;

                return (
                  <div className="lot-card" key={a.id}>
                    <div className="lot-card-hdr">
                      <input
                        className="lot-name-input"
                        type="text"
                        placeholder={`Active ${index + 1}`}
                        value={a.label}
                        onChange={(e) => updateActive(a.id, { label: e.target.value })}
                      />
                      <div className="lot-card-actions">
                        {actives.length > 1 && (
                          <button
                            type="button"
                            className="lot-icon-btn danger"
                            title="Remove this active"
                            onClick={() => removeActive(a.id)}
                          >
                            <i className="ti ti-trash" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="lot-field-grid">
                      <div className="field" style={{ margin: 0 }}>
                        <label>Target mg / tablet</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          step="0.1"
                          value={a.targetMgPerTablet}
                          onChange={(e) => updateActive(a.id, { targetMgPerTablet: e.target.value })}
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Raw material potency</label>
                        <div className="row">
                          <input
                            type="number"
                            placeholder="0.00"
                            step="0.01"
                            value={a.potencyPercent}
                            onChange={(e) => updateActive(a.id, { potencyPercent: e.target.value })}
                          />
                          <div className="unit">%</div>
                        </div>
                      </div>
                    </div>
                    <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
                      <label>Source (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Vendor X, Lot #123"
                        value={a.source}
                        onChange={(e) => updateActive(a.id, { source: e.target.value })}
                      />
                    </div>

                    {showAiTrigger && (
                      <button
                        type="button"
                        className="btn"
                        style={{ marginTop: 10 }}
                        onClick={() => requestAiSuggestion(a.id, trimmedLabel)}
                      >
                        <i className="ti ti-sparkles" /> Suggest with AI
                      </button>
                    )}
                    {showAiLoading && <div className="field-hint" style={{ marginTop: 8 }}>Getting an AI suggestion…</div>}
                    {showAiError && (
                      <div className="field-hint" style={{ marginTop: 8 }}>
                        {aiState!.error}{' '}
                        <button
                          type="button"
                          className="btn"
                          style={{ height: 22, padding: '0 8px', fontSize: 10, display: 'inline-flex' }}
                          onClick={() => requestAiSuggestion(a.id, trimmedLabel)}
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {showSuggestionPanel && suggestion && (
                      <div className="suggestion-panel">
                        <div className="suggestion-panel-hdr">
                          <span className={`suggestion-badge ${suggestion.source}`}>
                            {suggestion.source === 'known' ? 'Reference values' : 'AI-suggested — not validated'}
                          </span>
                          <span className="suggestion-title">Suggested values for {suggestion.matchedLabel}</span>
                        </div>
                        <div className="suggestion-grid">
                          <div className="suggestion-cell">
                            <span>mg/tablet</span>
                            <strong>{fmt(suggestion.targetMgPerTablet, 1)}</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Potency</span>
                            <strong>{suggestion.potencyPercent}%</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Tablet weight</span>
                            <strong>{suggestion.tabletWeightG}g</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Disintegrant</span>
                            <strong>{suggestion.disintegrantPercent}%</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Lubricant</span>
                            <strong>{suggestion.lubricantPercent}%</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Glidant</span>
                            <strong>{suggestion.glidantPercent}%</strong>
                          </div>
                        </div>
                        <div className="suggestion-note">{suggestion.note}</div>
                        <div className="suggestion-actions">
                          <button
                            type="button"
                            className="btn btn-p"
                            onClick={() => applySuggestion(a.id, trimmedLabel, suggestion)}
                          >
                            <i className="ti ti-check" /> Use these values
                          </button>
                          <button type="button" className="btn" onClick={() => dismissSuggestion(a.id, trimmedLabel)}>
                            Dismiss
                          </button>
                        </div>
                        <div className="suggestion-hint">
                          Fills mg/tablet and potency for this active now; fills tablet weight and excipient % fields
                          later only if they&apos;re still empty.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <button type="button" className="add-lot-btn" onClick={addActive}>
                <i className="ti ti-plus" /> Add another active
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="wizard-guidance">
                <i className="ti ti-info-circle" />
                <span>
                  Filler (or diluent) makes up whatever weight is left in the tablet once actives and other excipients
                  are accounted for — its % below auto-calculates from everything else you&apos;ve entered.
                </span>
              </div>
              <div className="field">
                <label>Filler type</label>
                <input
                  type="text"
                  placeholder="e.g. Emdex"
                  value={fillerName}
                  onChange={(e) => setFillerName(e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>% filler (auto)</label>
                <div className="row">
                  <input type="number" readOnly value={derived.fillerPercent.toFixed(2)} />
                  <div className="unit">%</div>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="wizard-guidance">
                <i className="ti ti-info-circle" />
                <span>
                  A disintegrant helps the tablet break apart after swallowing; a lubricant keeps the powder from
                  sticking to the press tooling during compression; a glidant improves powder flow so the die fills
                  consistently. All three are optional here.
                </span>
              </div>
              <div className="lot-field-grid">
                <div className="field" style={{ margin: 0 }}>
                  <label>Disintegrant</label>
                  <input
                    type="text"
                    placeholder="e.g. PVPP XL"
                    value={disintegrantName}
                    onChange={(e) => setDisintegrantName(e.target.value)}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>%</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.1"
                    value={disintegrantPercent}
                    onChange={(e) => setDisintegrantPercent(e.target.value)}
                  />
                </div>
              </div>
              <div className="lot-field-grid" style={{ marginTop: 8 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Lubricant</label>
                  <input
                    type="text"
                    placeholder="e.g. Magnesium stearate"
                    value={lubricantName}
                    onChange={(e) => setLubricantName(e.target.value)}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>%</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.1"
                    value={lubricantPercent}
                    onChange={(e) => setLubricantPercent(e.target.value)}
                  />
                </div>
              </div>
              <div className="lot-field-grid" style={{ marginTop: 8, marginBottom: 0 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Glidant</label>
                  <input
                    type="text"
                    placeholder="e.g. Silicon Dioxide"
                    value={glidantName}
                    onChange={(e) => setGlidantName(e.target.value)}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>%</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.1"
                    value={glidantPercent}
                    onChange={(e) => setGlidantPercent(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="wizard-guidance">
                <i className="ti ti-info-circle" />
                <span>Check the assembled formulation below, then save it to the library — go back to any step to fix something first.</span>
              </div>
              <div className="stats">
                <div className="stat">
                  <div className="stat-lbl">Target potency</div>
                  <div className="stat-val">{derived.combinedActivePercent.toFixed(2)}%</div>
                  <div className="stat-unit">of blend</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Total batch weight</div>
                  <div className="stat-val">{fmt(derived.totalBatchG, 0)}</div>
                  <div className="stat-unit">grams</div>
                </div>
              </div>

              <div className="add-sub">{name.trim() || 'Untitled formulation'}</div>
              <div className="add-row">
                <div className="add-lbl">
                  <i className="ti ti-scale" />
                  Tablet weight · reference batch
                </div>
                <div className="add-val">
                  {fmt(numOrZero(tabletWeightG), 3)} g · {fmt(numOrZero(referenceBatchTablets), 0)} tablets
                </div>
              </div>

              <div className="add-sub" style={{ marginTop: 14 }}>
                Active ingredients
              </div>
              <div>
                {derived.actives.map((a) => (
                  <div className="add-row key" key={a.label}>
                    <div className="add-lbl">
                      <i className="ti ti-plus" />
                      {a.label} — {fmt(a.targetMgPerTablet, 1)} mg/tab @ {a.potencyPercent.toFixed(2)}%
                    </div>
                    <div className="add-val green">
                      {a.percentOfBlend.toFixed(3)}% · {fmt(a.gramsPerBatch, 1)} g
                    </div>
                  </div>
                ))}
              </div>

              <div className="add-sub" style={{ marginTop: 14 }}>
                Excipients
              </div>
              <div>
                <div className="add-row">
                  <div className="add-lbl">
                    <i className="ti ti-cube" />
                    {fillerName || 'Filler'} (auto)
                  </div>
                  <div className="add-val">
                    {derived.fillerPercent.toFixed(2)}% · {fmt(derived.fillerGramsPerBatch, 1)} g
                  </div>
                </div>
                {disintegrantName.trim() && (
                  <div className="add-row">
                    <div className="add-lbl">
                      <i className="ti ti-circle-plus" />
                      {disintegrantName}
                    </div>
                    <div className="add-val">
                      {numOrZero(disintegrantPercent).toFixed(2)}% ·{' '}
                      {fmt(derived.disintegrantGramsPerBatch ?? 0, 1)} g
                    </div>
                  </div>
                )}
                {lubricantName.trim() && (
                  <div className="add-row">
                    <div className="add-lbl">
                      <i className="ti ti-droplet" />
                      {lubricantName}
                    </div>
                    <div className="add-val">
                      {numOrZero(lubricantPercent).toFixed(2)}% · {fmt(derived.lubricantGramsPerBatch ?? 0, 1)} g
                    </div>
                  </div>
                )}
                {glidantName.trim() && (
                  <div className="add-row">
                    <div className="add-lbl">
                      <i className="ti ti-wind" />
                      {glidantName}
                    </div>
                    <div className="add-val">
                      {numOrZero(glidantPercent).toFixed(2)}% · {fmt(derived.glidantGramsPerBatch ?? 0, 1)} g
                    </div>
                  </div>
                )}
              </div>
              {!canSave && (
                <div className="field-hint" style={{ marginTop: 10 }}>
                  Go back and fill in every required field (name, tablet weight, batch size, filler, and each
                  active&apos;s mg/tablet and potency) before saving.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="wizard-nav">
        <button type="button" className="btn" onClick={back} disabled={step === 0}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-p" onClick={next} disabled={!stepValid[step]}>
            Next <i className="ti ti-arrow-right" />
          </button>
        ) : (
          <button type="button" className="btn btn-p" onClick={onSave} disabled={!canSave || saving}>
            <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save to library'}
          </button>
        )}
      </div>
    </div>
  );
}
