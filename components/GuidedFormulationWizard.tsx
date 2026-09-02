'use client';

import { useEffect, useState } from 'react';
import type { ActiveDraft } from './FormulationBuilderPage';
import { PERCENT_SUM_TOLERANCE, type SavedFormulationDerived } from '@/lib/savedFormulations';
import { suggestionProvenanceLabel, type FormulationSuggestion } from '@/lib/knownActives';
import { applySuggestionToFields, resolveSuggestion } from '@/lib/suggestionTiers';
import { numOrZero, fmt } from '@/lib/format';
import {
  getPreferredWeightUnit,
  setPreferredWeightUnit,
  type WeightEntryUnit,
} from '@/lib/weightUnitPreference';

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
  /** False when derived.percentOverflow exceeds tolerance and hasn't been overridden — see FormulationBuilderPage. */
  percentagesValid: boolean;
  overflowAcknowledged: boolean;
  onAcknowledgeOverflow: () => void;
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
    percentagesValid,
    overflowAcknowledged,
    onAcknowledgeOverflow,
    canSave,
    saving,
    onSave,
  } = props;

  const [step, setStep] = useState(0);
  // Both unit toggles below default to 'g' on first render — matching what
  // the server renders, since localStorage isn't available during SSR — and
  // are corrected to the persisted preference in the effect just after, once
  // we're definitely client-side. Reading localStorage straight into the
  // useState initializer would make the client's first render disagree with
  // the server's and trip a hydration mismatch.
  const [tabletWeightUnit, setTabletWeightUnit] = useState<WeightEntryUnit>('g');
  // Per-active dose display unit — local wizard UI state only. Canonical
  // storage stays mg regardless (ActiveDraft.targetMgPerTablet, matching the
  // calc engine's mg-canonical dose convention app-wide), same
  // convert-on-input/convert-for-display-only split as tabletWeightUnit above.
  const [doseUnit, setDoseUnit] = useState<Record<string, WeightEntryUnit>>({});
  useEffect(() => {
    setTabletWeightUnit(getPreferredWeightUnit());
  }, []);
  function selectTabletWeightUnit(unit: WeightEntryUnit) {
    setTabletWeightUnit(unit);
    setPreferredWeightUnit(unit);
  }
  function doseUnitFor(activeId: string): WeightEntryUnit {
    return doseUnit[activeId] ?? tabletWeightUnit;
  }
  function selectDoseUnit(activeId: string, unit: WeightEntryUnit) {
    setDoseUnit((prev) => ({ ...prev, [activeId]: unit }));
    setPreferredWeightUnit(unit);
  }

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
    // Blocks leaving Excipients while actives + disintegrant + lubricant +
    // glidant exceed 100% (filler would have to go negative) — resolved
    // either by lowering something below, or by the explicit override in
    // the banner below, which flips percentagesValid true for this specific
    // overflow amount.
    percentagesValid,
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

  // Dose (target mg/tablet) display/entry conversion — canonical storage is
  // always mg (ActiveDraft.targetMgPerTablet), so 'g' here is purely a
  // display convenience for the rare high-dose active where entering grams
  // is more natural; converts back to mg on every keystroke exactly like
  // tabletWeightDisplay/handleTabletWeightChange above.
  function doseDisplay(active: ActiveDraft): string {
    const unit = doseUnitFor(active.id);
    if (unit === 'mg') return active.targetMgPerTablet;
    return active.targetMgPerTablet === '' ? '' : String(numOrZero(active.targetMgPerTablet) / 1000);
  }
  function handleDoseChange(activeId: string, raw: string) {
    const unit = doseUnitFor(activeId);
    if (unit === 'mg') {
      updateActive(activeId, { targetMgPerTablet: raw });
    } else {
      updateActive(activeId, { targetMgPerTablet: raw === '' ? '' : String(numOrZero(raw) * 1000) });
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
    const applied = applySuggestionToFields(
      { tabletWeightG, disintegrantPercent, lubricantPercent, glidantName, glidantPercent },
      s
    );
    updateActive(activeId, applied.active);
    setTabletWeightG(applied.fields.tabletWeightG);
    setDisintegrantPercent(applied.fields.disintegrantPercent);
    setLubricantPercent(applied.fields.lubricantPercent);
    setGlidantName(applied.fields.glidantName);
    setGlidantPercent(applied.fields.glidantPercent);
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
                      onClick={() => selectTabletWeightUnit('g')}
                    >
                      g
                    </button>
                    <button
                      type="button"
                      className={`m-btn${tabletWeightUnit === 'mg' ? ' active' : ''}`}
                      onClick={() => selectTabletWeightUnit('mg')}
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
                const aiState = aiSuggestions[a.id];
                const dismissedForCurrentLabel = resolvedFor[a.id] === trimmedLabel;

                // Tier choice lives in lib/suggestionTiers.ts so it can be
                // tested without a DOM; needsAi is false for a known active,
                // which is what keeps the table tier from ever calling the API.
                const { suggestion, needsAi } = resolveSuggestion(
                  trimmedLabel,
                  aiState?.status === 'done' ? aiState.result : null
                );

                const showSuggestionPanel = !!suggestion && !dismissedForCurrentLabel;
                const showAiTrigger = needsAi && trimmedLabel.length >= 3 && !dismissedForCurrentLabel && !aiState;
                const showAiLoading = needsAi && aiState?.status === 'loading';
                const showAiError = needsAi && aiState?.status === 'error' && !dismissedForCurrentLabel;

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
                        <label>Target dose per tablet</label>
                        <div className="row">
                          <input
                            type="number"
                            placeholder="0.00"
                            step={doseUnitFor(a.id) === 'mg' ? '0.1' : '0.0001'}
                            value={doseDisplay(a)}
                            onChange={(e) => handleDoseChange(a.id, e.target.value)}
                          />
                          <div className="mode-toggle" style={{ margin: 0, width: 96 }}>
                            <button
                              type="button"
                              className={`m-btn${doseUnitFor(a.id) === 'mg' ? ' active' : ''}`}
                              onClick={() => selectDoseUnit(a.id, 'mg')}
                            >
                              mg
                            </button>
                            <button
                              type="button"
                              className={`m-btn${doseUnitFor(a.id) === 'g' ? ' active' : ''}`}
                              onClick={() => selectDoseUnit(a.id, 'g')}
                            >
                              g
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Raw material potency (% purity)</label>
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
                          {/* Names the provenance, not just the tier: a
                              generic pharmacopeial figure and one derived
                              from this operator's own runs both arrive as
                              'known', and they warrant different trust. */}
                          <span className={`suggestion-badge ${suggestion.source}`}>
                            {suggestionProvenanceLabel(suggestion)}
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
                            <strong>{suggestion.potencyPercent.toFixed(2)}%</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Tablet weight</span>
                            <strong>{suggestion.tabletWeightG}g</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Disintegrant</span>
                            <strong>{suggestion.disintegrantPercent.toFixed(2)}%</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Lubricant</span>
                            <strong>{suggestion.lubricantPercent.toFixed(2)}%</strong>
                          </div>
                          <div className="suggestion-cell">
                            <span>Glidant</span>
                            <strong>{suggestion.glidantPercent.toFixed(2)}%</strong>
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
                <label>Filler — % of blend (auto)</label>
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
                  <label>% of blend</label>
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
                  <label>% of blend</label>
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
                  <label>% of blend</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.1"
                    value={glidantPercent}
                    onChange={(e) => setGlidantPercent(e.target.value)}
                  />
                </div>
              </div>

              {derived.percentOverflow > PERCENT_SUM_TOLERANCE && (
                <div className="verify-banner" style={{ marginTop: 12 }}>
                  <i className="ti ti-alert-triangle" />
                  <div className="verify-banner-body">
                    <div className="verify-banner-title">
                      Component percentages exceed 100% by {derived.percentOverflow.toFixed(2)}%
                    </div>
                    <div className="verify-banner-notes">
                      Actives ({derived.combinedActivePercent.toFixed(2)}%) + disintegrant + lubricant + glidant
                      already add up to more than 100% of the blend, so filler can&apos;t make up the difference —
                      lower something above, or override to continue anyway.
                    </div>
                    {!overflowAcknowledged && (
                      <button type="button" className="verify-ack-btn" onClick={onAcknowledgeOverflow}>
                        Reviewed, proceeding
                      </button>
                    )}
                  </div>
                </div>
              )}
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

              {derived.percentOverflow > PERCENT_SUM_TOLERANCE && (
                <div className="verify-banner" style={{ marginBottom: 12 }}>
                  <i className="ti ti-alert-triangle" />
                  <div className="verify-banner-body">
                    <div className="verify-banner-title">
                      Component percentages exceed 100% by {derived.percentOverflow.toFixed(2)}%
                    </div>
                    <div className="verify-banner-notes">
                      {overflowAcknowledged
                        ? 'Overridden — saving anyway. Go back to Excipients to fix it instead.'
                        : "This has to be resolved before saving — go back to Excipients to lower something, or override there."}
                    </div>
                  </div>
                </div>
              )}

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
                Active ingredients — % of blend
              </div>
              <div>
                {derived.actives.map((a) => (
                  <div className="add-row key" key={a.label}>
                    <div className="add-lbl">
                      <i className="ti ti-plus" />
                      {a.label} — {fmt(a.targetMgPerTablet, 1)} mg/tab @ {a.potencyPercent.toFixed(2)}% potency
                    </div>
                    <div className="add-val green">
                      {a.percentOfBlend.toFixed(2)}% · {fmt(a.gramsPerBatch, 1)} g
                    </div>
                  </div>
                ))}
              </div>

              <div className="add-sub" style={{ marginTop: 14 }}>
                Excipients — % of blend
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
              {!canSave && !percentagesValid && (
                <div className="field-hint" style={{ marginTop: 10 }}>
                  Resolve the percentage overflow above before saving.
                </div>
              )}
              {!canSave && percentagesValid && (
                <div className="field-hint" style={{ marginTop: 10 }}>
                  Go back and fill in every required field (name, tablet weight, batch size, filler, and each
                  active&apos;s dose and potency) before saving.
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
