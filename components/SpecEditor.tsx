'use client';

import { useState } from 'react';
import {
  SPEC_TEST_TYPES,
  type RawMaterialDetail,
  type SpecCriterionPayload,
  type SpecCriterionRecord,
  type SpecTestType,
} from '@/lib/rawMaterials';
import { fmtDate } from '@/lib/format';

const TEST_TYPE_LABELS: Record<SpecTestType, string> = {
  numeric_range: 'Numeric range',
  qualitative: 'Qualitative',
};

/** A criterion as it exists in the editor's local state. `retired` here is the
 *  *intent* for the next save, not the stored `retiredAt` — a row marked
 *  retired is simply left out of the PUT payload, which is what the endpoint
 *  reads as "retire this". */
interface EditableCriterion {
  /** Stable local key. Newly added rows have no id yet, so they can't be
   *  keyed on one. */
  key: string;
  id?: string;
  parameterName: string;
  testType: SpecTestType;
  minValue: string;
  maxValue: string;
  targetValue: string;
  passCriteriaText: string;
  retired: boolean;
  /** Whether it was ALREADY retired when the editor opened. Distinguishes
   *  "this is on the shelf, restore it to put it back" from "you just took
   *  this off the spec, and saving will retire it". */
  wasRetired: boolean;
}

let keySeq = 0;
function nextKey() {
  return `crit-${(keySeq += 1)}`;
}

function toEditable(c: SpecCriterionRecord, retired: boolean): EditableCriterion {
  return {
    key: nextKey(),
    id: c.id,
    parameterName: c.parameterName,
    testType: (c.testType as SpecTestType) ?? 'numeric_range',
    minValue: c.minValue === null ? '' : String(c.minValue),
    maxValue: c.maxValue === null ? '' : String(c.maxValue),
    targetValue: c.targetValue === null ? '' : String(c.targetValue),
    passCriteriaText: c.passCriteriaText ?? '',
    retired,
    wasRetired: retired,
  };
}

function blankCriterion(): EditableCriterion {
  return {
    key: nextKey(),
    parameterName: '',
    testType: 'numeric_range',
    minValue: '',
    maxValue: '',
    targetValue: '',
    passCriteriaText: '',
    retired: false,
    wasRetired: false,
  };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Human-readable limits for a criterion, for read-only display. */
export function criterionLimits(c: SpecCriterionRecord): string {
  if (c.testType !== 'numeric_range') {
    return c.passCriteriaText || 'Qualitative — no written pass condition';
  }
  const parts: string[] = [];
  if (c.minValue !== null) parts.push(`min ${c.minValue}`);
  if (c.maxValue !== null) parts.push(`max ${c.maxValue}`);
  if (c.targetValue !== null) parts.push(`target ${c.targetValue}`);
  return parts.length ? parts.join(' · ') : 'No limits set';
}

interface SpecEditorProps {
  material: RawMaterialDetail;
  onSaved: () => void;
}

export default function SpecEditor({ material, onSaved }: SpecEditorProps) {
  const [editing, setEditing] = useState(false);
  const [specName, setSpecName] = useState('');
  const [rows, setRows] = useState<EditableCriterion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCriteria = material.spec?.criteria ?? [];

  function beginEdit() {
    setSpecName(material.spec?.name || `${material.name} — in-house spec`);
    setRows([
      ...activeCriteria.map((c) => toEditable(c, false)),
      ...material.retiredCriteria.map((c) => toEditable(c, true)),
    ]);
    setError(null);
    setEditing(true);
  }

  function update(key: string, patch: Partial<EditableCriterion>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(row: EditableCriterion) {
    // A criterion that was never saved has no history to preserve, so it can
    // just disappear. One that exists in the DB is marked retired instead —
    // dropping it from the payload is what tells the server to retire it.
    if (!row.id) setRows((prev) => prev.filter((r) => r.key !== row.key));
    else update(row.key, { retired: true });
  }

  /** Mirrors parseSpecCriterion in lib/rawMaterials.ts so the same mistakes
   *  are caught before a round trip. The server still validates — this is a
   *  convenience, not the boundary. */
  function validate(payload: SpecCriterionPayload[]): string | null {
    for (const [i, c] of payload.entries()) {
      const at = c.parameterName.trim() || `Criterion ${i + 1}`;
      if (!c.parameterName.trim()) return `${at}: a parameter name is required.`;
      if (c.testType === 'numeric_range') {
        if (c.minValue === null && c.maxValue === null) {
          return `${at}: a numeric criterion needs at least a minimum or a maximum, or no result could ever be evaluated against it.`;
        }
        if (c.minValue !== null && c.maxValue !== null && c.minValue > c.maxValue) {
          return `${at}: the minimum cannot exceed the maximum.`;
        }
      }
    }
    const names = payload.map((c) => c.parameterName.trim().toLowerCase());
    const dupe = names.find((n, i) => names.indexOf(n) !== i);
    if (dupe) return `Two criteria are both named “${dupe}”. Give each parameter a distinct name.`;
    return null;
  }

  async function save() {
    // Retired rows are omitted entirely: the PUT body is the full intended
    // criteria list, and anything currently on the spec but absent from it is
    // what the endpoint retires.
    const payload: SpecCriterionPayload[] = rows
      .filter((r) => !r.retired)
      .map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        parameterName: r.parameterName.trim(),
        testType: r.testType,
        minValue: r.testType === 'numeric_range' ? parseOptionalNumber(r.minValue) : null,
        maxValue: r.testType === 'numeric_range' ? parseOptionalNumber(r.maxValue) : null,
        targetValue: r.testType === 'numeric_range' ? parseOptionalNumber(r.targetValue) : null,
        passCriteriaText: r.testType === 'qualitative' ? r.passCriteriaText.trim() || null : null,
      }));

    const problem = validate(payload);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/raw-materials/${material.id}/spec`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: specName, criteria: payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to save this spec.');
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError('Failed to save this spec.');
    } finally {
      setSaving(false);
    }
  }

  // Two different things, deliberately shown separately: parameters the user
  // just took off the spec (saving will retire them) versus ones already on
  // the shelf (saving leaves them there — the retire sweep only touches
  // criteria that are currently active).
  const pendingRetirements = rows.filter((r) => r.retired && r.id && !r.wasRetired);
  const alreadyRetired = rows.filter((r) => r.retired && r.wasRetired);

  if (!editing) {
    return (
      <div className="card" style={{ flexShrink: 0 }}>
        <div className="card-hdr">
          <div className="card-hdr-title">
            <i className="ti ti-clipboard-list" />
            Component spec
          </div>
          <button type="button" className="btn" onClick={beginEdit}>
            <i className={`ti ti-${material.spec ? 'edit' : 'plus'}`} />
            {material.spec ? 'Edit spec' : 'Create spec'}
          </button>
        </div>
        <div className="card-body">
          {!material.spec ? (
            <>
              <div className="rule-note warn">
                <i className="ti ti-alert-triangle" />
                <div>
                  This material has no spec. A lot with no spec — or an empty one — is reported{' '}
                  <b>pending</b>, never pass: “every criterion passed” is vacuously true when there
                  are no criteria, so a never-tested lot can never read as released.
                </div>
              </div>
              <div className="empty">
                <i className="ti ti-clipboard-list" />
                No criteria yet
              </div>
            </>
          ) : (
            <>
              <div className="add-sub">{material.spec.name}</div>
              {activeCriteria.length === 0 ? (
                <div className="empty">
                  <i className="ti ti-clipboard-list" />
                  This spec has no active criteria — lots of this material stay pending
                </div>
              ) : (
                <table className="var-tbl">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Type</th>
                      <th>Limits / pass condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCriteria.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.parameterName}</td>
                        <td>{TEST_TYPE_LABELS[c.testType as SpecTestType] ?? c.testType}</td>
                        <td>{criterionLimits(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {material.retiredCriteria.length > 0 && (
            <>
              <div className="add-sub" style={{ marginTop: 16 }}>
                Retired criteria
              </div>
              <div className="rule-note">
                <i className="ti ti-archive" />
                <div>
                  Retired parameters are off the current spec, so they no longer affect any lot’s
                  status and can’t take new results. Every test ever recorded against them is
                  retained — retiring is not a delete.
                </div>
              </div>
              {material.retiredCriteria.map((c) => (
                <div className="rm-crit-row retired" key={c.id}>
                  <div className="rm-crit-row-hdr">
                    <div className="rm-crit-title">{c.parameterName}</div>
                    <span className="rm-retired-tag">Retired</span>
                  </div>
                  <div className="field-hint">
                    {criterionLimits(c)}
                    {c.retiredAt && ` · retired ${fmtDate(c.retiredAt)}`}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ flexShrink: 0 }}>
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-clipboard-list" />
          {material.spec ? 'Edit component spec' : 'Create component spec'}
        </div>
      </div>
      <div className="card-body">
        <div className="rule-note">
          <i className="ti ti-info-circle" />
          <div>
            Removing a parameter <b>retires</b> it rather than deleting it. Every test result already
            recorded against it stays on the lots that hold it — retiring only takes the parameter
            off the current spec, so it stops counting toward future status calculations and stops
            accepting new results. A retired parameter can be restored later, keeping its history
            attached.
          </div>
        </div>

        <div className="field">
          <label htmlFor="spec-name">Spec name</label>
          <input
            id="spec-name"
            type="text"
            value={specName}
            onChange={(e) => setSpecName(e.target.value)}
            placeholder="e.g. Magnesium stearate NF, in-house spec rev. 3"
          />
          <div className="field-hint">
            The spec document’s own title — distinct from the material’s name.
          </div>
        </div>

        <div className="add-sub" style={{ marginTop: 14 }}>
          Criteria
        </div>

        {rows.filter((r) => !r.retired).length === 0 && (
          <div className="empty">
            <i className="ti ti-clipboard-list" />
            No active criteria — a lot with an empty spec stays pending
          </div>
        )}

        {rows
          .filter((r) => !r.retired)
          .map((row) => (
            <div className="rm-crit-row" key={row.key}>
              <div className="rm-crit-row-hdr">
                <div className="rm-crit-title">
                  {row.parameterName.trim() || 'New parameter'}
                </div>
                <button
                  type="button"
                  className="lot-icon-btn danger"
                  title={row.id ? 'Retire this parameter' : 'Remove this parameter'}
                  onClick={() => removeRow(row)}
                >
                  <i className={`ti ti-${row.id ? 'archive' : 'trash'}`} />
                </button>
              </div>
              <div className="rm-form-grid-2">
                <div className="field">
                  <label>Parameter name</label>
                  <input
                    type="text"
                    value={row.parameterName}
                    onChange={(e) => update(row.key, { parameterName: e.target.value })}
                    placeholder="e.g. Purity"
                  />
                </div>
                <div className="field">
                  <label>Test type</label>
                  <select
                    value={row.testType}
                    onChange={(e) => update(row.key, { testType: e.target.value as SpecTestType })}
                  >
                    {SPEC_TEST_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TEST_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {row.testType === 'numeric_range' ? (
                <>
                  <div className="rm-form-grid">
                    <div className="field">
                      <label>Minimum</label>
                      <input
                        type="number"
                        step="any"
                        value={row.minValue}
                        onChange={(e) => update(row.key, { minValue: e.target.value })}
                        placeholder="none"
                      />
                    </div>
                    <div className="field">
                      <label>Maximum</label>
                      <input
                        type="number"
                        step="any"
                        value={row.maxValue}
                        onChange={(e) => update(row.key, { maxValue: e.target.value })}
                        placeholder="none"
                      />
                    </div>
                    <div className="field">
                      <label>Target</label>
                      <input
                        type="number"
                        step="any"
                        value={row.targetValue}
                        onChange={(e) => update(row.key, { targetValue: e.target.value })}
                        placeholder="optional"
                      />
                    </div>
                  </div>
                  <div className="field-hint">
                    Bounds are inclusive, and one-sided limits are fine — heavy metals usually has a
                    maximum only. At least one bound is required. Pass/fail for this parameter is
                    computed from these limits when a result is logged; the tester never sets it.
                  </div>
                </>
              ) : (
                <div className="field">
                  <label>Pass condition</label>
                  <textarea
                    className="rm-textarea"
                    value={row.passCriteriaText}
                    onChange={(e) => update(row.key, { passCriteriaText: e.target.value })}
                    placeholder="e.g. Conforms to reference IR spectrum"
                  />
                  <div className="field-hint">
                    Recorded for the tester to judge against — never matched in code. A qualitative
                    result carries the tester’s own pass/fail verdict.
                  </div>
                </div>
              )}
            </div>
          ))}

        <button
          type="button"
          className="add-lot-btn"
          onClick={() => setRows((prev) => [...prev, blankCriterion()])}
        >
          <i className="ti ti-plus" /> Add criterion
        </button>

        {pendingRetirements.length > 0 && (
          <>
            <div className="add-sub" style={{ marginTop: 16 }}>
              Will be retired on save
            </div>
            {pendingRetirements.map((row) => (
              <div className="rm-crit-row retired" key={row.key}>
                <div className="rm-crit-row-hdr">
                  <div className="rm-crit-title">{row.parameterName || 'Unnamed parameter'}</div>
                  <span className="rm-retired-tag">Retiring</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => update(row.key, { retired: false })}
                  >
                    <i className="ti ti-arrow-back-up" /> Restore
                  </button>
                </div>
                <div className="field-hint">
                  Existing results for this parameter are kept. It stops counting toward lot status
                  and stops accepting new results.
                </div>
              </div>
            ))}
          </>
        )}

        {alreadyRetired.length > 0 && (
          <>
            <div className="add-sub" style={{ marginTop: 16 }}>
              Previously retired
            </div>
            <div className="field-hint" style={{ marginBottom: 8 }}>
              Restoring one puts it back on the spec with its existing test history still attached,
              rather than creating a duplicate parameter alongside it.
            </div>
            {alreadyRetired.map((row) => (
              <div className="rm-crit-row retired" key={row.key}>
                <div className="rm-crit-row-hdr">
                  <div className="rm-crit-title">{row.parameterName || 'Unnamed parameter'}</div>
                  <span className="rm-retired-tag">Retired</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => update(row.key, { retired: false })}
                  >
                    <i className="ti ti-arrow-back-up" /> Restore
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {error && <div className="rm-inline-err">{error}</div>}

        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-p" onClick={save} disabled={saving || !specName.trim()}>
            <i className="ti ti-check" /> {saving ? 'Saving…' : 'Save spec'}
          </button>
          <button type="button" className="btn" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
