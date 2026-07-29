'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { defaultIngredients } from '@/lib/calc-engine';
import { fmt } from '@/lib/format';
import type { RunRecord } from './RunHistoryPanel';

function targetPotencyPercent(run: RunRecord): number {
  return run.result.mode === 'fresh' ? run.result.activePercentOfBlend : run.result.effectivePotency * 100;
}

interface MaterialRow {
  label: string;
  value: string;
}

/** Condensed "what's in this batch" view, derived entirely from the run's already-computed result — no recalculation. */
function summarizeMaterials(run: RunRecord): MaterialRow[] {
  const result = run.result;
  if (result.mode === 'fresh') {
    const base = defaultIngredients();
    // `apis` was added to FreshBatchResult after some runs' result JSON was
    // already persisted — older rows predate it entirely (undefined, not
    // just empty), so this can't assume today's shape.
    const rows: MaterialRow[] = (result.apis ?? []).map((api) => ({
      label: api.label,
      value: `${fmt(result.ingredientGrams[api.id] ?? 0, 1)} g`,
    }));
    // Pre-multi-API runs keyed the single active ingredient's grams as
    // 'active' directly, with no apis[] entry to read a label from.
    if (rows.length === 0 && result.ingredientGrams['active'] != null) {
      const activeIng = base.find((i) => i.role === 'active');
      rows.push({ label: activeIng?.name ?? 'API', value: `${fmt(result.ingredientGrams['active'], 1)} g` });
    }
    for (const ing of base) {
      if (ing.role === 'active') continue;
      const grams = result.ingredientGrams[ing.id];
      if (grams == null) continue;
      rows.push({
        label: ing.calculatedByDifference ? (result.fillerType ?? ing.name) : ing.name,
        value: `${fmt(grams, 1)} g`,
      });
    }
    return rows;
  }
  const rows: MaterialRow[] = [];
  if (result.lots.length > 0) {
    rows.push({ label: 'Lots', value: result.lots.map((l) => l.label).join(', ') });
  }
  rows.push({ label: 'Reground powder', value: `${fmt(result.regroundPowderG, 0)} g` });
  if (result.freshActiveG > 0) {
    rows.push({ label: 'Fresh active', value: `${fmt(result.freshActiveG)} g` });
  }
  // easyTabG/siliconDioxideG/lubricantTopUpG were added to the calc engine
  // after some saved runs' result JSON was persisted — those older rows
  // simply lack the fields (undefined), so every reference here must
  // tolerate that rather than assume today's RegrindResult shape.
  rows.push({
    label: result.fillerIngredientName,
    value: `${fmt(result.fillerAddG + (result.easyTabG ?? 0), 1)} g`,
  });
  if (result.lubricantTopUpG > 0 && result.lubricantTopUpIngredientName) {
    rows.push({ label: result.lubricantTopUpIngredientName, value: `${fmt(result.lubricantTopUpG, 2)} g` });
  }
  if (result.siliconDioxideIngredientName) {
    rows.push({ label: result.siliconDioxideIngredientName, value: `${fmt(result.siliconDioxideG ?? 0, 2)} g` });
  }
  return rows;
}

interface VarianceLine {
  label: string;
  text: string;
  status: 'pos' | 'neutral';
}

function varianceLines(run: RunRecord, draft: CoaDraft): VarianceLine[] {
  const lines: VarianceLine[] = [];
  const targetMg = run.result.targetActiveMgPerTablet;
  const actualMg = parseFloat(draft.actualMgPerTablet);
  if (targetMg > 0 && Number.isFinite(actualMg)) {
    const pct = ((actualMg - targetMg) / targetMg) * 100;
    const sign = pct >= 0 ? '+' : '';
    lines.push({
      label: 'mg / tablet',
      text: `Target: ${targetMg.toFixed(1)} mg · Actual: ${actualMg.toFixed(1)} mg (${sign}${pct.toFixed(1)}%)`,
      status: Math.abs(pct) >= 5 ? 'pos' : 'neutral',
    });
  }
  const targetWt = run.result.targetWeightG;
  const actualWt = parseFloat(draft.actualTabletWeight);
  if (targetWt > 0 && Number.isFinite(actualWt)) {
    const pct = ((actualWt - targetWt) / targetWt) * 100;
    const sign = pct >= 0 ? '+' : '';
    lines.push({
      label: 'tablet weight',
      text: `Target: ${targetWt.toFixed(3)} g · Actual: ${actualWt.toFixed(3)} g (${sign}${pct.toFixed(1)}%)`,
      status: Math.abs(pct) >= 5 ? 'pos' : 'neutral',
    });
  }
  return lines;
}

interface CoaDraft {
  actualMgPerTablet: string;
  actualTabletWeight: string;
  passFail: 'pass' | 'fail' | null;
  notes: string;
}

function draftFromRun(run: RunRecord): CoaDraft {
  return {
    actualMgPerTablet: run.actualMgPerTablet != null ? String(run.actualMgPerTablet) : '',
    actualTabletWeight: run.actualTabletWeight != null ? String(run.actualTabletWeight) : '',
    passFail: run.passFail ?? null,
    notes: run.notes ?? '',
  };
}

export default function RunHistoryPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, CoaDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/runs')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RunRecord[]) => {
        setRuns(data);
        const initialDrafts: Record<string, CoaDraft> = {};
        for (const run of data) initialDrafts[run.id] = draftFromRun(run);
        setDrafts(initialDrafts);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!justSavedId) return;
    const timer = setTimeout(() => setJustSavedId(null), 2500);
    return () => clearTimeout(timer);
  }, [justSavedId]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateDraft(id: string, patch: Partial<CoaDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function saveCoa(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualMgPerTablet: draft.actualMgPerTablet === '' ? null : parseFloat(draft.actualMgPerTablet),
          actualTabletWeight: draft.actualTabletWeight === '' ? null : parseFloat(draft.actualTabletWeight),
          passFail: draft.passFail,
          notes: draft.notes === '' ? null : draft.notes,
        }),
      });
      if (!res.ok) {
        alert('Failed to save COA results.');
        return;
      }
      const saved: RunRecord = await res.json();
      setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...saved } : r)));
      setJustSavedId(id);
    } catch {
      alert('Failed to save COA results.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">Run history</div>
          </div>
        </div>
        <div className="rh-page">
          {/* flexShrink: 0 — see RunHistoryPanel.tsx: without this, expanding
              a row's COA detail overflows the card and gets silently clipped
              instead of .rh-page scrolling to reveal it. */}
          <div className="card" style={{ flexShrink: 0 }}>
            {loading ? (
              <div className="empty">
                <i className="ti ti-history" />
                Loading…
              </div>
            ) : runs.length === 0 ? (
              <div className="empty">
                <i className="ti ti-history" />
                No saved runs yet
              </div>
            ) : (
              <>
                <div className="rh-list-hdr">
                  <div>Run</div>
                  <div>Mode</div>
                  <div>Date</div>
                  <div>Target potency</div>
                  <div>Tablets</div>
                  <div />
                </div>
                {runs.map((run) => {
                  const isOpen = expanded.has(run.id);
                  const draft = drafts[run.id] ?? draftFromRun(run);
                  return (
                    <div className="rh-row" key={run.id}>
                      <button className="rh-row-summary" onClick={() => toggleExpanded(run.id)}>
                        <div className="rh-cell-name">{run.label}</div>
                        <div className="rh-cell">
                          <span className={`run-tag ${run.mode === 'fresh' ? 'tag-fr' : 'tag-rg'}`}>
                            {run.mode === 'fresh' ? 'Fresh' : 'Regrind'}
                          </span>
                        </div>
                        <div className="rh-cell">{new Date(run.createdAt).toLocaleDateString()}</div>
                        <div className="rh-cell">{targetPotencyPercent(run).toFixed(2)}%</div>
                        <div className="rh-cell">{run.result.tabletCount.toLocaleString()}</div>
                        <i className={`ti ti-chevron-right rh-chevron${isOpen ? ' open' : ''}`} />
                      </button>

                      {isOpen && (
                        <div className="rh-detail">
                          <div>
                            <div className="rh-detail-hdr">Materials used</div>
                            {summarizeMaterials(run).length === 0 ? (
                              <div className="rh-cell">No detailed breakdown available for this run</div>
                            ) : (
                              <div className="rh-materials">
                                {summarizeMaterials(run).map((m) => (
                                  <span className="rh-material-chip" key={m.label}>
                                    <b>{m.label}</b>
                                    {m.value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="rh-detail-hdr">COA results</div>
                            <div className="rh-coa-grid">
                              <div className="field" style={{ margin: 0 }}>
                                <label>Actual mg / tablet</label>
                                <div className="row">
                                  <input
                                    type="number"
                                    placeholder="0.00"
                                    step="0.01"
                                    value={draft.actualMgPerTablet}
                                    onChange={(e) => updateDraft(run.id, { actualMgPerTablet: e.target.value })}
                                  />
                                  <div className="unit">mg</div>
                                </div>
                              </div>
                              <div className="field" style={{ margin: 0 }}>
                                <label>Actual tablet weight</label>
                                <div className="row">
                                  <input
                                    type="number"
                                    placeholder="0.000"
                                    step="0.001"
                                    value={draft.actualTabletWeight}
                                    onChange={(e) => updateDraft(run.id, { actualTabletWeight: e.target.value })}
                                  />
                                  <div className="unit">g</div>
                                </div>
                              </div>
                              <div className="field" style={{ margin: 0 }}>
                                <label>Pass / Fail</label>
                                <div className="rh-passfail">
                                  <button
                                    type="button"
                                    className={`rh-pf-btn pass${draft.passFail === 'pass' ? ' active' : ''}`}
                                    onClick={() =>
                                      updateDraft(run.id, { passFail: draft.passFail === 'pass' ? null : 'pass' })
                                    }
                                  >
                                    Pass
                                  </button>
                                  <button
                                    type="button"
                                    className={`rh-pf-btn fail${draft.passFail === 'fail' ? ' active' : ''}`}
                                    onClick={() =>
                                      updateDraft(run.id, { passFail: draft.passFail === 'fail' ? null : 'fail' })
                                    }
                                  >
                                    Fail
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="field" style={{ marginBottom: 10 }}>
                              <label>Notes</label>
                              <textarea
                                className="rh-notes"
                                placeholder="Anything else worth recording about this batch…"
                                value={draft.notes}
                                onChange={(e) => updateDraft(run.id, { notes: e.target.value })}
                              />
                            </div>
                            <div className="rh-save-row">
                              <button
                                type="button"
                                className="btn btn-p"
                                onClick={() => saveCoa(run.id)}
                                disabled={savingId === run.id}
                              >
                                {savingId === run.id ? 'Saving…' : 'Save COA results'}
                              </button>
                              {justSavedId === run.id && <span className="rh-saved-note">Saved</span>}
                            </div>
                          </div>

                          <div>
                            <div className="rh-detail-hdr">Calculated vs. actual</div>
                            {varianceLines(run, draft).length === 0 ? (
                              <div className="rh-variance-row neutral">
                                Enter actual COA values above to see variance from target
                              </div>
                            ) : (
                              varianceLines(run, draft).map((line) => (
                                <div className={`rh-variance-row ${line.status}`} key={line.label}>
                                  {line.text}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
