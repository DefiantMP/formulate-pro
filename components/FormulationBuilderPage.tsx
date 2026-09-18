'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from './Sidebar';
import FloatingChatWidget from './FloatingChatWidget';
import type { ChatMessage } from './ChatPanel';
import GuidedFormulationWizard from './GuidedFormulationWizard';
import type { RunRecord } from './RunHistoryPanel';
import {
  crossCheckSheetGrams,
  deriveSavedFormulation,
  parseOtherExcipients,
  PERCENT_SUM_TOLERANCE,
  SAVED_FORMULATION_STATUSES,
  savedFormulationStatusLabel,
  type SavedFormulationActive,
  type SavedFormulationRecord,
  type SavedFormulationStatus,
} from '@/lib/savedFormulations';
import { numOrZero, fmt } from '@/lib/format';
import type { ExtractedFormulation } from '@/lib/documentReading';

/** What the Formulations "Import" button hands the builder, via sessionStorage. */
export interface FormulationImportDraft {
  attachmentId: string;
  filename: string;
  method: 'text_file' | 'transcribed';
  formulation: ExtractedFormulation;
}
export const IMPORT_DRAFT_PREFIX = 'formulate-import:';

interface OtherDraft {
  id: string;
  name: string;
  percent: string;
}

export interface ActiveDraft {
  id: string;
  label: string;
  targetMgPerTablet: string;
  potencyPercent: string;
  source: string;
}

let activeIdCounter = 0;
function makeActiveId(): string {
  activeIdCounter += 1;
  return `draft-active-${Date.now()}-${activeIdCounter}`;
}

function blankActive(): ActiveDraft {
  return { id: makeActiveId(), label: '', targetMgPerTablet: '', potencyPercent: '', source: '' };
}

interface FormulationBuilderPageProps {
  /** When set, this draft pre-fills from and iterates that formulation — see the "Iterate" button on FormulationDetailPage. */
  iterateFromId?: string;
  /** When set, this draft pre-fills from an imported sheet (see FormulationsLibraryPage's Import). */
  importDraftKey?: string;
}

/**
 * A sandbox for drafting a base formulation from scratch — not tied to a
 * live Fresh Batch or Regrind calculation, and never fed into
 * calculateFreshBatch/calculateRegrind. Reuses the calc engine's mg/tablet
 * <-> %-of-blend conversion (via deriveSavedFormulation) for the live
 * preview, but everything else here is exploratory reference-sheet math.
 *
 * When iterateFromId is set, the draft is pre-filled from that formulation
 * on mount (fully editable from there) but nothing is written to the DB
 * until Save — "Iterate" only navigates here, it never creates a row by
 * itself. Save reuses the exact same create-only POST /api/saved-formulations
 * endpoint, just with parentId set, so no separate update/edit endpoint is
 * needed and no orphaned empty version is left behind if the user abandons
 * the edit.
 */
export default function FormulationBuilderPage({ iterateFromId, importDraftKey }: FormulationBuilderPageProps) {
  const router = useRouter();

  const [builderMode, setBuilderMode] = useState<'quick' | 'guided'>('quick');
  const [name, setName] = useState('');
  const [tabletWeightG, setTabletWeightG] = useState('');
  const [referenceBatchTablets, setReferenceBatchTablets] = useState('10000');
  const [actives, setActives] = useState<ActiveDraft[]>([blankActive()]);
  const [fillerName, setFillerName] = useState('Emdex');
  const [disintegrantName, setDisintegrantName] = useState('PVPP XL');
  const [disintegrantPercent, setDisintegrantPercent] = useState('5');
  const [lubricantName, setLubricantName] = useState('Magnesium stearate');
  const [lubricantPercent, setLubricantPercent] = useState('2');
  const [glidantName, setGlidantName] = useState('');
  const [glidantPercent, setGlidantPercent] = useState('');
  const [others, setOthers] = useState<OtherDraft[]>([]);
  const [importInfo, setImportInfo] = useState<FormulationImportDraft | null>(null);
  const [mismatchAcknowledged, setMismatchAcknowledged] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SavedFormulationStatus>('untested');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [equipmentNotes, setEquipmentNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [parent, setParent] = useState<SavedFormulationRecord | null>(null);
  const [loadingParent, setLoadingParent] = useState(!!iterateFromId);

  useEffect(() => {
    if (!iterateFromId) return;
    let cancelled = false;
    setLoadingParent(true);
    fetch(`/api/saved-formulations/${iterateFromId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SavedFormulationRecord | null) => {
        if (cancelled || !data) return;
        setParent(data);
        setName(data.name);
        setTabletWeightG(String(data.tabletWeightG));
        setReferenceBatchTablets(String(data.referenceBatchTablets));
        setActives(
          data.actives.map((a) => ({
            id: makeActiveId(),
            label: a.label,
            targetMgPerTablet: String(a.targetMgPerTablet),
            potencyPercent: String(a.potencyPercent),
            source: a.source,
          }))
        );
        setFillerName(data.fillerName);
        setDisintegrantName(data.disintegrantName ?? '');
        setDisintegrantPercent(data.disintegrantPercent != null ? String(data.disintegrantPercent) : '');
        setLubricantName(data.lubricantName ?? '');
        setLubricantPercent(data.lubricantPercent != null ? String(data.lubricantPercent) : '');
        setGlidantName(data.glidantName ?? '');
        setGlidantPercent(data.glidantPercent != null ? String(data.glidantPercent) : '');
        setOthers(
          parseOtherExcipients(data.otherExcipients).map((e, i) => ({
            id: `other-${i}-${Date.now()}`,
            name: e.name,
            percent: String(e.percentOfBlend),
          }))
        );
        // Outcome fields (status/outcomeNotes/equipmentNotes) deliberately
        // reset for the new iteration rather than copying the parent's —
        // the parent's describe what already happened to it, not this
        // not-yet-tested draft.
      })
      .finally(() => {
        if (!cancelled) setLoadingParent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [iterateFromId]);

  // Pre-fill from an imported sheet. Every field the reading could not fill
  // with confidence is left EMPTY rather than defaulted — a blank that must be
  // filled is safer than a plausible default nobody checked. The excipient
  // slots are cleared first for the same reason: the builder's own defaults
  // (PVPP 5%, Mag 2%) must never survive into an imported formulation.
  useEffect(() => {
    if (!importDraftKey) return;
    let draft: FormulationImportDraft | null = null;
    try {
      const raw = sessionStorage.getItem(IMPORT_DRAFT_PREFIX + importDraftKey);
      draft = raw ? (JSON.parse(raw) as FormulationImportDraft) : null;
    } catch {
      draft = null;
    }
    if (!draft) return;
    const f = draft.formulation;
    const numStr = (n: number | null) => (n == null ? '' : String(n));
    setImportInfo(draft);
    setName(f.name ?? '');
    setTabletWeightG(numStr(f.tabletWeightG));
    setReferenceBatchTablets(numStr(f.referenceBatchTablets));
    setActives(
      f.actives.length
        ? f.actives.map((a) => ({
            id: makeActiveId(),
            label: a.label,
            targetMgPerTablet: numStr(a.targetMgPerTablet),
            potencyPercent: numStr(a.potencyPercent),
            source: '',
          }))
        : [blankActive()]
    );
    setFillerName(f.fillerName ?? '');
    const take = (role: string) => f.excipients.find((e) => e.role === role) ?? null;
    const dis = take('disintegrant');
    const lub = take('lubricant');
    const gli = take('glidant');
    setDisintegrantName(dis?.name ?? '');
    setDisintegrantPercent(numStr(dis?.percentOfBlend ?? null));
    setLubricantName(lub?.name ?? '');
    setLubricantPercent(numStr(lub?.percentOfBlend ?? null));
    setGlidantName(gli?.name ?? '');
    setGlidantPercent(numStr(gli?.percentOfBlend ?? null));
    setOthers(
      f.excipients
        .filter((e) => e !== dis && e !== lub && e !== gli)
        .map((e, i) => ({ id: `other-${i}-${Date.now()}`, name: e.name, percent: numStr(e.percentOfBlend) }))
    );
    setNotes(f.notes ?? '');
  }, [importDraftKey]);

  // Sampled once for the Guided wizard's step-1 tablet-weight guidance —
  // deliberately drawn from this app's own saved data (never hardcoded
  // figures in the copy) and simply unused if the library/run history is
  // empty. Quick Entry doesn't need this, but fetching is cheap regardless
  // of which mode the page opens in.
  const [tabletWeightSamples, setTabletWeightSamples] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/saved-formulations')
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []) as Promise<SavedFormulationRecord[]>,
      fetch('/api/runs')
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []) as Promise<RunRecord[]>,
    ]).then(([formulations, runs]) => {
      if (cancelled) return;
      const samples = [
        ...formulations.map((f) => f.tabletWeightG),
        ...runs.map((r) => (r.result as { targetWeightG?: number } | null)?.targetWeightG),
      ].filter((n): n is number => typeof n === 'number' && n > 0);
      setTabletWeightSamples(samples);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const tabletWeightHint = useMemo(() => {
    if (tabletWeightSamples.length === 0) return null;
    const min = Math.min(...tabletWeightSamples);
    const max = Math.max(...tabletWeightSamples);
    return min === max
      ? `Formulations already in this app use ${min.toFixed(2)}g per tablet.`
      : `Formulations already in this app range from ${min.toFixed(2)}g to ${max.toFixed(2)}g per tablet.`;
  }, [tabletWeightSamples]);

  function updateActive(id: string, patch: Partial<ActiveDraft>) {
    setActives((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  function addActive() {
    setActives((prev) => [...prev, blankActive()]);
  }
  function removeActive(id: string) {
    setActives((prev) => (prev.length <= 1 ? prev : prev.filter((a) => a.id !== id)));
  }

  const tabletWeightNum = numOrZero(tabletWeightG);
  const referenceBatchNum = numOrZero(referenceBatchTablets);

  const derived = useMemo(() => {
    return deriveSavedFormulation({
      tabletWeightG: tabletWeightNum,
      referenceBatchTablets: referenceBatchNum,
      actives: actives.map((a, i) => ({
        label: a.label.trim() || `Active ${i + 1}`,
        targetMgPerTablet: numOrZero(a.targetMgPerTablet),
        potencyPercent: numOrZero(a.potencyPercent),
        source: a.source,
      })),
      disintegrantPercent: disintegrantPercent === '' ? null : numOrZero(disintegrantPercent),
      lubricantPercent: lubricantPercent === '' ? null : numOrZero(lubricantPercent),
      glidantPercent: glidantPercent === '' ? null : numOrZero(glidantPercent),
      otherExcipients: others
        .filter((o) => o.name.trim() && o.percent !== '')
        .map((o) => ({ name: o.name.trim(), percentOfBlend: numOrZero(o.percent) })),
    });
  }, [tabletWeightNum, referenceBatchNum, actives, disintegrantPercent, lubricantPercent, glidantPercent, others]);

  // Recalculate the imported sheet and compare it with the grams the sheet
  // itself lists — how a misread digit is caught. Live, so correcting a field
  // clears its flag.
  const importCheck = useMemo(() => {
    if (!importInfo || importInfo.formulation.sheetGrams.length === 0) return null;
    return crossCheckSheetGrams(
      importInfo.formulation.sheetGrams,
      importInfo.formulation.sheetTotalGrams,
      {
        actives: actives.map((a, i) => ({ label: a.label.trim() || `Active ${i + 1}` })),
        fillerName,
        disintegrantName: disintegrantName.trim() || null,
        lubricantName: lubricantName.trim() || null,
        glidantName: glidantName.trim() || null,
      },
      derived
    );
  }, [importInfo, actives, fillerName, disintegrantName, lubricantName, glidantName, derived]);
  const mismatchCount = importCheck?.mismatches.length ?? 0;
  useEffect(() => {
    setMismatchAcknowledged(false);
  }, [mismatchCount]);

  const othersValid = others.every(
    (o) =>
      (o.name.trim() === '' && o.percent === '') ||
      (o.name.trim() !== '' && o.percent !== '' && numOrZero(o.percent) >= 0 && numOrZero(o.percent) <= 100)
  );

  // Filler is calculated by difference (100% - everything else), so the
  // blend sums to 100% by construction UNLESS actives + disintegrant +
  // lubricant + glidant already exceed 100% on their own — in that case
  // fillerPercent clamps to 0 rather than going negative, which would
  // otherwise hide the over-allocation entirely. derived.percentOverflow is
  // the unclamped excess; overflowAcknowledged is an explicit override,
  // deliberately re-armed (see the effect below) whenever the overflow
  // amount changes, so an old acknowledgment can't silently cover a new,
  // different over-allocation.
  const [overflowAcknowledged, setOverflowAcknowledged] = useState(false);
  useEffect(() => {
    setOverflowAcknowledged(false);
  }, [derived.percentOverflow]);
  const percentagesValid = derived.percentOverflow <= PERCENT_SUM_TOLERANCE || overflowAcknowledged;

  const canSave =
    !loadingParent &&
    name.trim() !== '' &&
    tabletWeightNum > 0 &&
    referenceBatchNum > 0 &&
    fillerName.trim() !== '' &&
    actives.every((a) => a.label.trim() !== '' && numOrZero(a.targetMgPerTablet) > 0 && numOrZero(a.potencyPercent) > 0) &&
    percentagesValid &&
    othersValid &&
    (mismatchCount === 0 || mismatchAcknowledged);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: {
        name: string;
        tabletWeightG: number;
        referenceBatchTablets: number;
        actives: SavedFormulationActive[];
        fillerName: string;
        disintegrantName: string | null;
        disintegrantPercent: number | null;
        lubricantName: string | null;
        lubricantPercent: number | null;
        glidantName: string | null;
        glidantPercent: number | null;
        otherExcipients: { name: string; percentOfBlend: number }[];
        importedFrom?: string;
        attachmentId?: string;
        notes: string | null;
        parentId?: string;
        status: SavedFormulationStatus;
        outcomeNotes: string | null;
        equipmentNotes: string | null;
      } = {
        name: name.trim(),
        tabletWeightG: tabletWeightNum,
        referenceBatchTablets: referenceBatchNum,
        actives: actives.map((a, i) => ({
          label: a.label.trim() || `Active ${i + 1}`,
          targetMgPerTablet: numOrZero(a.targetMgPerTablet),
          potencyPercent: numOrZero(a.potencyPercent),
          source: a.source.trim(),
        })),
        fillerName: fillerName.trim(),
        disintegrantName: disintegrantName.trim() || null,
        disintegrantPercent: disintegrantPercent === '' ? null : numOrZero(disintegrantPercent),
        lubricantName: lubricantName.trim() || null,
        lubricantPercent: lubricantPercent === '' ? null : numOrZero(lubricantPercent),
        glidantName: glidantName.trim() || null,
        glidantPercent: glidantPercent === '' ? null : numOrZero(glidantPercent),
        otherExcipients: others
          .filter((o) => o.name.trim() && o.percent !== '')
          .map((o) => ({ name: o.name.trim(), percentOfBlend: numOrZero(o.percent) })),
        ...(importInfo ? { importedFrom: importInfo.filename, attachmentId: importInfo.attachmentId } : {}),
        notes: notes.trim() || null,
        ...(iterateFromId ? { parentId: iterateFromId } : {}),
        status,
        outcomeNotes: outcomeNotes.trim() || null,
        equipmentNotes: equipmentNotes.trim() || null,
      };
      const res = await fetch('/api/saved-formulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert('Failed to save formulation.');
        return;
      }
      const saved: { id: string } = await res.json();
      if (importDraftKey) {
        try {
          sessionStorage.removeItem(IMPORT_DRAFT_PREFIX + importDraftKey);
        } catch {
          /* private browsing — nothing to clean up */
        }
      }
      router.push(`/formulations/${saved.id}`);
    } catch {
      alert('Failed to save formulation.');
    } finally {
      setSaving(false);
    }
  }

  async function handleChatSend(message: string, history: ChatMessage[]): Promise<string> {
    const res = await fetch(`/api/saved-formulations/${iterateFromId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.reply !== 'string') {
      throw new Error(data?.error || 'Chat unavailable right now.');
    }
    return data.reply;
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <Link href="/formulations" className="btn">
              <i className="ti ti-arrow-left" /> Formulations
            </Link>
            <div className="topbar-title">New formulation</div>
            <span className="mode-chip">
              {iterateFromId
                ? `Iterating from ${parent ? `v${parent.version} — ${parent.name}` : '…'}`
                : importInfo
                  ? 'Imported — check before saving'
                  : 'Draft — not a saved run'}
            </span>
          </div>
          <div className="topbar-right">
            <div className="mode-toggle" style={{ marginBottom: 0, width: 200 }}>
              <button
                type="button"
                className={`m-btn${builderMode === 'quick' ? ' active' : ''}`}
                onClick={() => setBuilderMode('quick')}
              >
                Quick entry
              </button>
              <button
                type="button"
                className={`m-btn${builderMode === 'guided' ? ' active' : ''}`}
                onClick={() => setBuilderMode('guided')}
              >
                Guided
              </button>
            </div>
            <button className="btn btn-p" onClick={save} disabled={!canSave || saving}>
              <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save to library'}
            </button>
          </div>
        </div>
        {importInfo && (
          <div className="import-banner">
            <div className="import-banner-top">
              <div>
                <b>Imported from {importInfo.filename}</b>
                {importInfo.method === 'transcribed' ? ' — read by AI. ' : ' — read from the file. '}
                Check every value against the original before saving. Anything the reading was unsure of is left
                blank for you to fill in.
              </div>
              <a href={`/api/attachments/${importInfo.attachmentId}`} target="_blank" rel="noreferrer" className="btn btn-sm">
                <i className="ti ti-external-link" /> Open original
              </a>
            </div>
            {importInfo.formulation.uncertainFields.length > 0 && (
              <div className="import-banner-line warn">
                <i className="ti ti-alert-triangle" /> Unsure about: {importInfo.formulation.uncertainFields.join('; ')}
              </div>
            )}
            {importCheck === null ? (
              <div className="import-banner-line">
                <i className="ti ti-info-circle" /> The sheet lists no gram amounts, so the reading could not be
                cross-checked — check the numbers by eye.
              </div>
            ) : importCheck.mismatches.length === 0 ? (
              <div className="import-banner-line ok">
                <i className="ti ti-circle-check" /> All {importCheck.checked} amounts on the sheet match what these
                values calculate to.
                {importCheck.unmatched.length > 0 && ` Not matched by name, so not checked: ${importCheck.unmatched.join(', ')}.`}
              </div>
            ) : (
              <div className="import-banner-line bad">
                <div>
                  <i className="ti ti-alert-octagon" /> {importCheck.mismatches.length} amount
                  {importCheck.mismatches.length === 1 ? '' : 's'} on the sheet disagree with what these values
                  calculate to — usually a misread number:
                  <ul>
                    {importCheck.mismatches.map((m) => (
                      <li key={m.name}>
                        <b>{m.name}</b>: sheet {fmt(m.sheetGrams, 2)} g, calculated {fmt(m.calculatedGrams, 2)} g
                      </li>
                    ))}
                  </ul>
                  <label className="recovery-ack">
                    <input
                      type="checkbox"
                      checked={mismatchAcknowledged}
                      onChange={(e) => setMismatchAcknowledged(e.target.checked)}
                    />
                    I&apos;ve checked these against the original and the values are right
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
        {builderMode === 'guided' ? (
          <div className="content">
            <GuidedFormulationWizard
              name={name}
              setName={setName}
              tabletWeightG={tabletWeightG}
              setTabletWeightG={setTabletWeightG}
              referenceBatchTablets={referenceBatchTablets}
              setReferenceBatchTablets={setReferenceBatchTablets}
              tabletWeightHint={tabletWeightHint}
              actives={actives}
              updateActive={updateActive}
              addActive={addActive}
              removeActive={removeActive}
              fillerName={fillerName}
              setFillerName={setFillerName}
              disintegrantName={disintegrantName}
              setDisintegrantName={setDisintegrantName}
              disintegrantPercent={disintegrantPercent}
              setDisintegrantPercent={setDisintegrantPercent}
              lubricantName={lubricantName}
              setLubricantName={setLubricantName}
              lubricantPercent={lubricantPercent}
              setLubricantPercent={setLubricantPercent}
              glidantName={glidantName}
              setGlidantName={setGlidantName}
              glidantPercent={glidantPercent}
              setGlidantPercent={setGlidantPercent}
              derived={derived}
              percentagesValid={percentagesValid}
              overflowAcknowledged={overflowAcknowledged}
              onAcknowledgeOverflow={() => setOverflowAcknowledged(true)}
              canSave={canSave}
              saving={saving}
              onSave={save}
            />
          </div>
        ) : (
        <div className="content">
          <div className="col-left">
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="card-hdr">
                <div className="card-hdr-title">
                  <i className="ti ti-flask" /> Inputs
                </div>
              </div>
              <div className="card-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <div className="field">
                  <label>Formulation name</label>
                  <input
                    type="text"
                    placeholder="e.g. Base formulation A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Target tablet weight</label>
                  <div className="row">
                    <input
                      type="number"
                      placeholder="0.00"
                      step="0.001"
                      value={tabletWeightG}
                      onChange={(e) => setTabletWeightG(e.target.value)}
                    />
                    <div className="unit">g</div>
                  </div>
                </div>
                <div className="field">
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

                <div className="hr" />
                <div className="sub-lbl">Active ingredients</div>
                {actives.map((a, index) => (
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
                  </div>
                ))}
                <button type="button" className="add-lot-btn" onClick={addActive}>
                  <i className="ti ti-plus" /> Add another active
                </button>

                <div className="hr" />
                <div className="sub-lbl">Excipients</div>
                <div className="field">
                  <label>Filler type</label>
                  <input
                    type="text"
                    placeholder="e.g. Emdex"
                    value={fillerName}
                    onChange={(e) => setFillerName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Filler — % of blend (auto)</label>
                  <div className="row">
                    <input type="number" readOnly value={derived.fillerPercent.toFixed(2)} />
                    <div className="unit">%</div>
                  </div>
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
                <div className="lot-field-grid" style={{ marginTop: 8 }}>
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

                {others.map((o) => (
                  <div className="lot-field-grid other-exc-row" style={{ marginTop: 8 }} key={o.id}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Other excipient</label>
                      <input
                        type="text"
                        placeholder="e.g. EZTAB"
                        value={o.name}
                        onChange={(e) =>
                          setOthers((prev) => prev.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>% of blend</label>
                      <div className="row">
                        <input
                          type="number"
                          placeholder="0.00"
                          step="0.1"
                          value={o.percent}
                          onChange={(e) =>
                            setOthers((prev) => prev.map((x) => (x.id === o.id ? { ...x, percent: e.target.value } : x)))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          title="Remove this excipient"
                          onClick={() => setOthers((prev) => prev.filter((x) => x.id !== o.id))}
                        >
                          <i className="ti ti-x" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => setOthers((prev) => [...prev, { id: `other-new-${Date.now()}`, name: '', percent: '' }])}
                >
                  <i className="ti ti-plus" /> Add another excipient
                </button>
                {!othersValid && (
                  <div className="rm-inline-err">Each extra excipient needs a name and a percentage from 0 to 100.</div>
                )}

                <div className="hr" />
                <div className="sub-lbl">Outcome (this version)</div>
                <div className="field">
                  <label>Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as SavedFormulationStatus)}>
                    {SAVED_FORMULATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {savedFormulationStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Issue / outcome notes</label>
                  <textarea
                    className="rh-notes"
                    placeholder="e.g. capping at compression, resolved after increasing lubricant…"
                    value={outcomeNotes}
                    onChange={(e) => setOutcomeNotes(e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Equipment / tooling notes</label>
                  <textarea
                    className="rh-notes"
                    placeholder="e.g. Press X, 3/8&quot; round tooling, fill cam set to slow, gravity-fed hopper…"
                    value={equipmentNotes}
                    onChange={(e) => setEquipmentNotes(e.target.value)}
                  />
                </div>

                <div className="hr" />
                <div className="field" style={{ margin: 0 }}>
                  <label>Notes</label>
                  <textarea
                    className="rh-notes"
                    placeholder="Anything else worth recording about this draft…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="col-mid">
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="card-hdr">
                <div className="card-hdr-title">
                  <i className="ti ti-calculator" /> Derived values
                </div>
              </div>
              <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
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
                        Actives + disintegrant + lubricant + glidant already add up to more than 100% of the blend,
                        so filler can&apos;t make up the difference — reduce something below, or override to save
                        anyway.
                      </div>
                      {!overflowAcknowledged && (
                        <button type="button" className="verify-ack-btn" onClick={() => setOverflowAcknowledged(true)}>
                          Reviewed, proceeding
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="add-sub">Active ingredients — % of blend</div>
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
                  {derived.otherExcipients.map((e) => (
                    <div className="add-row" key={e.name}>
                      <div className="add-lbl">
                        <i className="ti ti-circle-plus" />
                        {e.name}
                      </div>
                      <div className="add-val">
                        {e.percentOfBlend.toFixed(2)}% · {fmt(e.gramsPerBatch, 1)} g
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="col-right">
            {/* flexShrink: 0 — see RunHistoryPanel.tsx for why .col-right's
                flex column needs this on every card it stacks. */}
            <div className="card" style={{ flexShrink: 0 }}>
              <div className="card-hdr">
                <div className="card-hdr-title">
                  <i className="ti ti-flask-2" /> Continue in R&D Suite
                </div>
              </div>
              <div className="card-body">
                <div className="tip">
                  Keep experimenting with this draft&rsquo;s excipients before saving it to the library.
                </div>
                <Link href="/iterations" className="btn" style={{ width: '100%', marginBottom: 6 }}>
                  <i className="ti ti-chart-line" /> Iterations
                </Link>
                <Link href="/troubleshoot" className="btn" style={{ width: '100%', marginBottom: 6 }}>
                  <i className="ti ti-bug" /> Troubleshoot
                </Link>
                <Link href="/lab-notes" className="btn" style={{ width: '100%' }}>
                  <i className="ti ti-notes" /> Lab notes
                </Link>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      {iterateFromId && (
        <FloatingChatWidget
          title="Troubleshoot"
          icon="message-circle"
          placeholder="Describe an issue, e.g. &quot;tablets are capping&quot;…"
          emptyHint="Describe an issue (e.g. capping, sticking) to get advisory suggestions grounded in the parent formulation's version history."
          onSend={handleChatSend}
        />
      )}
    </div>
  );
}
