'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  calculateFreshBatch,
  calculateRegrind,
  generateVarianceTable,
  generateFreshBatchSOP,
  generateRegrindSOP,
  defaultIngredients,
} from '@/lib/calc-engine';
import type { IngredientLine, PotencyInput, RegrindLot } from '@/lib/calc-engine/types';
import { fmt, fmtK, numOrZero } from '@/lib/format';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import InputsPanel from './InputsPanel';
import OutputPanel, { type AddRowData, type StatsData, type TabKey, type LotBreakdownRow } from './OutputPanel';
import RunHistoryPanel, { type RunRecord } from './RunHistoryPanel';
import TipsCard from './TipsCard';
import VerifyIndicator, { type VerifyDiscrepancy, type VerifyStatus } from './VerifyIndicator';

const VERIFY_DEBOUNCE_MS = 800;

export type Mode = 'fresh' | 'regrind';
export type RegrindOption = 'a' | 'b';

/** One regrind lot's UI state — string inputs, mirroring the app's existing input-state convention. */
export interface RegrindLotState {
  id: string;
  label: string;
  opt: RegrindOption;
  aPot: string;
  bMg: string;
  bWt: string;
  weightG: string;
  disintegrantPercent: string;
  lubricantPercent: string;
  isStart: boolean;
  note: string;
}

export interface RegrindLotPresetRecord {
  id: string;
  name: string;
  potency: PotencyInput;
  disintegrantPercent: number | null;
  lubricantPercent: number | null;
}

let lotIdCounter = 0;
function makeLotId(): string {
  lotIdCounter += 1;
  return `lot-${Date.now()}-${lotIdCounter}`;
}

function blankLot(label: string): RegrindLotState {
  return {
    id: makeLotId(),
    label,
    opt: 'a',
    aPot: '',
    bMg: '',
    bWt: '',
    weightG: '',
    disintegrantPercent: '',
    lubricantPercent: '',
    isStart: false,
    note: '',
  };
}

function lotStateToPotency(lot: RegrindLotState): PotencyInput {
  return lot.opt === 'a'
    ? { method: 'bulkPercent', percent: numOrZero(lot.aPot) }
    : { method: 'mgPerTablet', mgPerOldTablet: numOrZero(lot.bMg), oldTabletWeightG: numOrZero(lot.bWt) };
}

export default function FormulateApp() {
  const [mode, setMode] = useState<Mode>('fresh');
  const [activeTab, setActiveTab] = useState<TabKey>('output');
  const [loadedRun, setLoadedRun] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // A counter rather than a boolean so back-to-back saves each restart the
  // dismiss timer, even if the toast is already showing.
  const [saveToastToken, setSaveToastToken] = useState(0);

  useEffect(() => {
    if (saveToastToken === 0) return;
    const timer = setTimeout(() => setSaveToastToken(0), 3000);
    return () => clearTimeout(timer);
  }, [saveToastToken]);

  const [fName, setFName] = useState('');
  const [fPot, setFPot] = useState('');
  const [fTmg, setFTmg] = useState('');
  const [fTwt, setFTwt] = useState('');
  const [fTabs, setFTabs] = useState('');
  const [excipientPercents, setExcipientPercents] = useState<Record<string, string>>({});

  function setExcipientPercent(id: string, value: string) {
    setExcipientPercents((prev) => ({ ...prev, [id]: value }));
  }

  const [lots, setLots] = useState<RegrindLotState[]>(() => [blankLot('Lot 1')]);
  const [rgPwd, setRgPwd] = useState('');
  const [rgTmg, setRgTmg] = useState('');
  const [rgTwt, setRgTwt] = useState('');

  const [presets, setPresets] = useState<RegrindLotPresetRecord[]>([]);

  useEffect(() => {
    fetch('/api/regrind-presets')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setPresets(Array.isArray(data) ? data : []))
      .catch(() => setPresets([]));
  }, []);

  function updateLot(id: string, patch: Partial<RegrindLotState>) {
    setLots((prev) => prev.map((lot) => (lot.id === id ? { ...lot, ...patch } : lot)));
  }

  function addLot() {
    setLots((prev) => [...prev, blankLot(`Lot ${prev.length + 1}`)]);
  }

  function removeLot(id: string) {
    setLots((prev) => (prev.length <= 1 ? prev : prev.filter((lot) => lot.id !== id)));
  }

  function loadPresetIntoLot(id: string, presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    const potencyPatch: Partial<RegrindLotState> =
      preset.potency.method === 'bulkPercent'
        ? { opt: 'a', aPot: String(preset.potency.percent) }
        : {
            opt: 'b',
            bMg: String(preset.potency.mgPerOldTablet),
            bWt: String(preset.potency.oldTabletWeightG),
          };
    updateLot(id, {
      ...potencyPatch,
      disintegrantPercent: preset.disintegrantPercent != null ? String(preset.disintegrantPercent) : '',
      lubricantPercent: preset.lubricantPercent != null ? String(preset.lubricantPercent) : '',
    });
  }

  async function saveLotAsPreset(id: string) {
    const lot = lots.find((l) => l.id === id);
    if (!lot) return;
    const name = window.prompt('Name this preset', lot.label);
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/regrind-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          potency: lotStateToPotency(lot),
          disintegrantPercent: lot.disintegrantPercent === '' ? null : numOrZero(lot.disintegrantPercent),
          lubricantPercent: lot.lubricantPercent === '' ? null : numOrZero(lot.lubricantPercent),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error ?? 'Failed to save preset.');
        return;
      }
      const saved: RegrindLotPresetRecord = await res.json();
      setPresets((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      alert('Failed to save preset.');
    }
  }

  async function deletePreset(presetId: string) {
    try {
      const res = await fetch(`/api/regrind-presets/${presetId}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('Failed to delete preset.');
        return;
      }
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
    } catch {
      alert('Failed to delete preset.');
    }
  }

  const baseIngredients = useMemo(() => defaultIngredients(), []);
  const activeIngredient = baseIngredients.find((i) => i.role === 'active')!;
  const fillerIngredient = baseIngredients.find((i) => i.calculatedByDifference)!;
  const excipients = useMemo(
    () => baseIngredients.filter((i) => i.role !== 'active' && !i.calculatedByDifference),
    [baseIngredients]
  );
  const alreadyPresentNames = baseIngredients
    .filter((i) => i.role === 'disintegrant' || i.role === 'lubricant')
    .map((i) => i.name);

  const freshIngredients = useMemo<IngredientLine[]>(
    () =>
      baseIngredients.map((i) => {
        // The active ingredient's percentOfBlend is derived internally by
        // calculateFreshBatch from potencyPercent — never set directly here.
        if (i.role === 'active') {
          return { ...i, name: fName.trim() || i.name };
        }
        if (i.calculatedByDifference) return i;
        return { ...i, percentOfBlend: numOrZero(excipientPercents[i.id] ?? '') };
      }),
    [baseIngredients, fName, excipientPercents]
  );

  // Live preview of the auto-filler %, mirroring the same derivation
  // calculateFreshBatch performs internally (potency is raw-material purity,
  // not the active ingredient's direct % of blend).
  const potencyNum = numOrZero(fPot);
  const targetMgNum = numOrZero(fTmg);
  const targetWtNum = numOrZero(fTwt);
  const derivedActivePercent =
    potencyNum > 0 && targetMgNum > 0 && targetWtNum > 0
      ? (targetMgNum / (potencyNum / 100) / (targetWtNum * 1000)) * 100
      : 0;
  const excipientPercentSum = excipients.reduce(
    (sum, i) => sum + numOrZero(excipientPercents[i.id] ?? ''),
    0
  );
  const emdexDisplay = Math.max(0, 100 - derivedActivePercent - excipientPercentSum).toFixed(2);

  const freshResult = useMemo(() => {
    try {
      return calculateFreshBatch({
        tabletCount: numOrZero(fTabs),
        targetWeightG: numOrZero(fTwt),
        targetActiveMgPerTablet: numOrZero(fTmg),
        potencyPercent: numOrZero(fPot),
        ingredients: freshIngredients,
      });
    } catch {
      return null;
    }
  }, [fTabs, fTwt, fTmg, fPot, freshIngredients]);

  const regrindLots = useMemo<RegrindLot[]>(
    () =>
      lots.map((lot) => ({
        id: lot.id,
        label: lot.label,
        potency: lotStateToPotency(lot),
        weightG: numOrZero(lot.weightG),
        disintegrantPercent: lot.disintegrantPercent === '' ? null : numOrZero(lot.disintegrantPercent),
        lubricantPercent: lot.lubricantPercent === '' ? null : numOrZero(lot.lubricantPercent),
        isStart: lot.isStart,
        note: lot.note,
      })),
    [lots]
  );

  const regrindResult = useMemo(() => {
    return calculateRegrind({
      lots: regrindLots,
      regroundPowderG: numOrZero(rgPwd),
      targetActiveMgPerTablet: numOrZero(rgTmg),
      targetWeightG: numOrZero(rgTwt),
      fillerIngredientName: fillerIngredient.name,
      alreadyPresentIngredientNames: alreadyPresentNames,
    });
  }, [regrindLots, rgPwd, rgTmg, rgTwt, fillerIngredient, alreadyPresentNames]);

  const result = mode === 'fresh' ? freshResult : regrindResult;

  const varianceRows = useMemo(
    () => (result ? generateVarianceTable(result.targetWeightG, result.targetActiveMgPerTablet) : []),
    [result]
  );

  const sopSteps = useMemo(() => {
    if (!result) return [];
    return result.mode === 'fresh'
      ? generateFreshBatchSOP(result, freshIngredients)
      : generateRegrindSOP(result);
  }, [result, freshIngredients]);

  const stats: StatsData | null = useMemo(() => {
    if (!result) return null;
    const potencyPercent =
      result.mode === 'fresh' ? result.activePercentOfBlend : result.effectivePotency * 100;
    const mgPerTab = result.mode === 'regrind' ? result.actualMgPerTablet : result.targetActiveMgPerTablet;
    const blend =
      result.totalBlendG >= 1000
        ? (result.totalBlendG / 1000).toFixed(1) + 'k'
        : Math.round(result.totalBlendG).toLocaleString();
    return {
      tablets: fmtK(result.tabletCount),
      blend,
      potency: potencyPercent.toFixed(3) + '%',
      mgPerTab: mgPerTab.toFixed(result.mode === 'regrind' ? 3 : 1) + ' mg',
    };
  }, [result]);

  const addRows: AddRowData[] = useMemo(() => {
    if (!result) return [];
    if (result.mode === 'fresh') {
      // Always one row per ingredient with a defined role, even at 0g — an
      // untouched or zero excipient should be visibly 0, never silently
      // absent, so it can't be mistaken for "not part of this formulation."
      return freshIngredients.map((ing) => {
        const grams = result.ingredientGrams[ing.id] ?? 0;
        const isActive = ing.role === 'active';
        const isFiller = ing.calculatedByDifference;
        const row: AddRowData = {
          label: isActive ? `${ing.name} active` : ing.name,
          value: `${fmt(grams, 2)} g`,
          icon: isActive ? 'plus' : isFiller ? 'cube' : 'circle-plus',
          key: isActive || isFiller,
        };
        return row;
      });
    }
    return [
      { label: 'Reground powder', value: `${fmt(result.regroundPowderG, 0)} g`, icon: 'reload', key: false },
      {
        label: `Fresh ${activeIngredient.name} to add`,
        value: result.freshActiveG > 0 ? `${fmt(result.freshActiveG)} g` : 'Not needed',
        icon: 'plus',
        key: result.freshActiveG > 0,
      },
      {
        label: `${result.fillerIngredientName} to add`,
        value: `${fmt(result.fillerAddG)} g`,
        icon: 'cube',
        key: true,
      },
    ];
  }, [result, activeIngredient, freshIngredients]);

  const warnRows: string[] = useMemo(() => {
    if (!result || result.mode !== 'regrind') return [];
    const rows: string[] = [];
    if (result.alreadyPresentIngredientNames.length > 0) {
      rows.push(`Do not add fresh ${result.alreadyPresentIngredientNames.join(' or ')} — already present in regrind`);
    }
    if (result.regroundPowderMismatch) {
      rows.push(
        `Total reground powder weight (${fmt(result.regroundPowderG, 0)} g) doesn't match the sum of lot weights (${fmt(result.lotWeightSum, 0)} g) — re-check before proceeding`
      );
    }
    return rows;
  }, [result]);

  const lotBreakdown: LotBreakdownRow[] | null = useMemo(() => {
    if (!result || result.mode !== 'regrind' || result.lots.length <= 1) return null;
    return result.lots.map((lot) => ({
      label: lot.label,
      weightG: lot.weightG,
      potencyPercent: lot.effectivePotency * 100,
      isStart: lot.isStart,
    }));
  }, [result]);

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifyDiscrepancy, setVerifyDiscrepancy] = useState<VerifyDiscrepancy | null>(null);
  const [verifyAcknowledgedAt, setVerifyAcknowledgedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setVerifyStatus('idle');
      setVerifyNotes('');
      setVerifyDiscrepancy(null);
      setVerifyAcknowledgedAt(null);
      return;
    }

    const inputsSnapshot =
      mode === 'fresh'
        ? { fName, fPot, fTmg, fTwt, fTabs, excipients: excipientPercents }
        : { lots: regrindLots, rgPwd, rgTmg, rgTwt };

    setVerifyStatus('checking');
    setVerifyDiscrepancy(null);
    setVerifyAcknowledgedAt(null);
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/ai/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, inputs: inputsSnapshot, result }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.status === 'confirmed') {
          setVerifyStatus('confirmed');
          setVerifyNotes(data.notes ?? '');
          setVerifyDiscrepancy(null);
        } else if (res.ok && data?.status === 'discrepancy') {
          setVerifyStatus('needs_review');
          setVerifyNotes(data.notes ?? '');
          setVerifyDiscrepancy(data.discrepancy ?? null);
        } else {
          setVerifyStatus('error');
          setVerifyNotes('Verification unavailable right now.');
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setVerifyStatus('error');
          setVerifyNotes('Verification unavailable right now.');
        }
      }
    }, VERIFY_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [result, mode, fName, fPot, fTmg, fTwt, fTabs, excipientPercents, regrindLots, rgPwd, rgTmg, rgTwt]);

  function acknowledgeDiscrepancy() {
    setVerifyAcknowledgedAt(new Date().toISOString());
    setVerifyStatus('acknowledged');
  }

  useEffect(() => {
    fetchRuns();
  }, []);

  async function fetchRuns() {
    setRunsLoading(true);
    try {
      const res = await fetch('/api/runs');
      if (res.ok) setRuns(await res.json());
    } finally {
      setRunsLoading(false);
    }
  }

  function loadRun(run: RunRecord) {
    setLoadedRun(run.id);
    const inputs = run.inputs;
    const str = (key: string) => (typeof inputs[key] === 'string' ? (inputs[key] as string) : '');
    if (run.mode === 'regrind') {
      setMode('regrind');
      const savedLots = inputs.lots;
      if (Array.isArray(savedLots) && savedLots.length > 0) {
        setLots(
          savedLots.map((raw) => {
            const l = raw as Partial<RegrindLot> & { id?: string; label?: string };
            const potency = l.potency as PotencyInput | undefined;
            return {
              id: l.id || makeLotId(),
              label: l.label || 'Lot',
              opt: potency?.method === 'mgPerTablet' ? 'b' : 'a',
              aPot: potency?.method === 'bulkPercent' ? String(potency.percent) : '',
              bMg: potency?.method === 'mgPerTablet' ? String(potency.mgPerOldTablet) : '',
              bWt: potency?.method === 'mgPerTablet' ? String(potency.oldTabletWeightG) : '',
              weightG: l.weightG != null ? String(l.weightG) : '',
              disintegrantPercent: l.disintegrantPercent != null ? String(l.disintegrantPercent) : '',
              lubricantPercent: l.lubricantPercent != null ? String(l.lubricantPercent) : '',
              isStart: l.isStart ?? false,
              note: l.note ?? '',
            };
          })
        );
      } else {
        // Backward compat: runs saved before multi-lot support used flat
        // opt/aPot/bMg/bWt fields for a single implicit lot.
        setLots([
          {
            id: makeLotId(),
            label: 'Lot 1',
            opt: (inputs.opt as RegrindOption) || 'a',
            aPot: str('aPot'),
            bMg: str('bMg'),
            bWt: str('bWt'),
            weightG: str('rgPwd'),
            disintegrantPercent: '',
            lubricantPercent: '',
            isStart: false,
            note: '',
          },
        ]);
      }
      setRgPwd(str('rgPwd'));
      setRgTmg(str('rgTmg'));
      setRgTwt(str('rgTwt'));
    } else {
      setMode('fresh');
      setFName(str('fName'));
      setFPot(str('fPot'));
      setFTmg(str('fTmg'));
      setFTwt(str('fTwt'));
      setFTabs(str('fTabs'));
      // Backward compat: runs saved before excipients became generic stored
      // fixed fMags/fPvpp fields instead of a per-ingredient map.
      const legacy: Record<string, string> = {};
      if (typeof inputs.fMags === 'string') legacy.magstearate = inputs.fMags;
      if (typeof inputs.fPvpp === 'string') legacy.pvpp = inputs.fPvpp;
      const savedExcipients = (inputs.excipients as Record<string, string> | undefined) ?? {};
      setExcipientPercents({ ...legacy, ...savedExcipients });
    }
  }

  async function saveRun() {
    if (!result) {
      alert('Nothing to save yet — enter values first.');
      return;
    }
    if (mode === 'fresh') {
      const uncommitted = excipients.filter((ing) => (excipientPercents[ing.id] ?? '') === '');
      if (uncommitted.length > 0) {
        const names = uncommitted.map((i) => i.name);
        const joined =
          names.length <= 2
            ? names.join(' and ')
            : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
        alert(
          `Enter a value for ${joined} before saving — use 0 if it's not used in this batch. An empty field can't be told apart from a forgotten one.`
        );
        return;
      }
    }
    if (verifyStatus === 'needs_review') {
      alert('Review the verification discrepancy above and click "Reviewed, proceeding" before saving this run.');
      return;
    }
    const defaultLabel = `${mode === 'fresh' ? 'Fresh' : 'Regrind'} ${new Date().toLocaleString()}`;
    const label = window.prompt('Name this run', defaultLabel);
    if (label === null) return;

    const inputs =
      mode === 'fresh'
        ? { fName, fPot, fTmg, fTwt, fTabs, excipients: excipientPercents }
        : { lots: regrindLots, rgPwd, rgTmg, rgTwt };

    const verificationAcknowledgment =
      verifyStatus === 'acknowledged' && verifyDiscrepancy && verifyAcknowledgedAt
        ? {
            acknowledgedAt: verifyAcknowledgedAt,
            field: verifyDiscrepancy.field,
            reportedValue: verifyDiscrepancy.reportedValue,
            computedValue: verifyDiscrepancy.computedValue,
            delta: verifyDiscrepancy.computedValue - verifyDiscrepancy.reportedValue,
            unit: verifyDiscrepancy.unit,
          }
        : null;

    setSaving(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim() || defaultLabel,
          mode,
          inputs,
          result,
          verificationAcknowledgment,
        }),
      });
      if (!res.ok) {
        alert('Failed to save run.');
        return;
      }
      const saved: RunRecord = await res.json();
      setRuns((prev) => [saved, ...prev]);
      setLoadedRun(saved.id);
      setSaveToastToken((prev) => prev + 1);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setLoadedRun(null);
    setFName('');
    setFPot('');
    setFTmg('');
    setFTwt('');
    setFTabs('');
    setExcipientPercents({});
    setLots([blankLot('Lot 1')]);
    setRgPwd('');
    setRgTmg('');
    setRgTwt('');
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar mode={mode} onReset={resetForm} onSaveRun={saveRun} saving={saving} />
        <div className="content">
          <div className="col-left">
            <InputsPanel
              mode={mode}
              onModeChange={setMode}
              fName={fName}
              setFName={setFName}
              fPot={fPot}
              setFPot={setFPot}
              fTmg={fTmg}
              setFTmg={setFTmg}
              fTwt={fTwt}
              setFTwt={setFTwt}
              fTabs={fTabs}
              setFTabs={setFTabs}
              excipients={excipients}
              excipientPercents={excipientPercents}
              setExcipientPercent={setExcipientPercent}
              fillerName={fillerIngredient.name}
              emdexDisplay={emdexDisplay}
              lots={lots}
              onUpdateLot={updateLot}
              onAddLot={addLot}
              onRemoveLot={removeLot}
              presets={presets}
              onLoadPreset={loadPresetIntoLot}
              onSaveAsPreset={saveLotAsPreset}
              onDeletePreset={deletePreset}
              rgPwd={rgPwd}
              setRgPwd={setRgPwd}
              rgTmg={rgTmg}
              setRgTmg={setRgTmg}
              rgTwt={rgTwt}
              setRgTwt={setRgTwt}
            />
          </div>

          <div className="col-mid">
            <VerifyIndicator
              status={verifyStatus}
              notes={verifyNotes}
              discrepancy={verifyDiscrepancy}
              onAcknowledge={acknowledgeDiscrepancy}
            />
            <OutputPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              hasResult={!!result}
              stats={stats}
              addRows={addRows}
              warnRows={warnRows}
              lotBreakdown={lotBreakdown}
              varianceRows={varianceRows}
              sopSteps={sopSteps}
            />
          </div>

          <div className="col-right">
            <RunHistoryPanel runs={runs} loading={runsLoading} loadedRun={loadedRun} onLoadRun={loadRun} />
            <TipsCard />
          </div>
        </div>
      </div>
      {saveToastToken > 0 && (
        <div className="toast" role="status">
          <i className="ti ti-circle-check" /> Run saved
        </div>
      )}
    </div>
  );
}
