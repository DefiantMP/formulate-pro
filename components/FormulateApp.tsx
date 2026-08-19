'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateFreshBatch,
  calculateRegrind,
  solveRegrindLotWeight,
  solveFreshBatchMaxTablets,
  generateVarianceTable,
  generateFreshBatchSOP,
  generateRegrindSOP,
  defaultIngredients,
} from '@/lib/calc-engine';
import type {
  IngredientLine,
  PotencyInput,
  RegrindLot,
  RegrindLotSourceType,
  FreshApiEntry,
  FreshApiPotency,
  FreshApiStockEntry,
} from '@/lib/calc-engine/types';
import { fmt, fmtK, numOrZero } from '@/lib/format';
import Sidebar from './Sidebar';
import Topbar, { type AutosaveStatus } from './Topbar';
import InputsPanel from './InputsPanel';
import NewRunModal from './NewRunModal';
import OutputPanel, { type AddRowData, type StatsData, type TabKey, type LotBreakdownRow } from './OutputPanel';
import RunHistoryPanel, { type RunRecord } from './RunHistoryPanel';
import TipsCard from './TipsCard';
import VerifyIndicator, { type VerifyDiscrepancy, type VerifyStatus } from './VerifyIndicator';

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
  fillerType: string;
  /** Optional, informational only — used for a stock-shortage warning, never affects calculation. */
  availableStockG: string;
  /** Determines this lot's share of the 0.15% lubricant top-up. Defaults to 'regroundTablets' for legacy lots/saved runs. */
  sourceType: RegrindLotSourceType;
  /** Solve-mode only: exactly one lot must have this true when regrindSolveMode is on. */
  isSolving: boolean;
  isStart: boolean;
  note: string;
}

export interface RegrindLotPresetRecord {
  id: string;
  name: string;
  potency: PotencyInput;
  disintegrantPercent: number | null;
  lubricantPercent: number | null;
  fillerType: string | null;
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
    fillerType: '',
    availableStockG: '',
    sourceType: 'regroundTablets',
    isSolving: false,
    isStart: false,
    note: '',
  };
}

function lotStateToPotency(lot: RegrindLotState): PotencyInput {
  return lot.opt === 'a'
    ? { method: 'bulkPercent', percent: numOrZero(lot.aPot) }
    : { method: 'mgPerTablet', mgPerOldTablet: numOrZero(lot.bMg), oldTabletWeightG: numOrZero(lot.bWt) };
}

/** Bulk % vs mg-per-unit — a single choice shared across every API in a fresh-batch run, not per-API. */
export type FreshPotencyMethod = 'bulkPercent' | 'mgPerUnit';

/** One fresh-batch API's UI state — string inputs, mirroring the app's existing input-state convention. */
export interface FreshApiState {
  id: string;
  label: string;
  targetMg: string;
  potPercent: string;
  potMgPerUnit: string;
  potUnitWeightG: string;
  /** Solve-mode only: how much raw material is on hand, in grams. Ignored outside solve mode. */
  availableStockG: string;
}

let apiIdCounter = 0;
function makeApiId(): string {
  apiIdCounter += 1;
  return `api-${Date.now()}-${apiIdCounter}`;
}

/** id 'active' matches the default formulation's single active ingredient id, so a single-API run keeps writing to the same ingredientGrams key it always has. */
function blankApi(label: string, id: string = makeApiId()): FreshApiState {
  return {
    id,
    label,
    targetMg: '',
    potPercent: '',
    potMgPerUnit: '',
    potUnitWeightG: '',
    availableStockG: '',
  };
}

function apiStateToPotency(method: FreshPotencyMethod, api: FreshApiState): FreshApiPotency {
  return method === 'bulkPercent'
    ? { method: 'bulkPercent', percent: numOrZero(api.potPercent) }
    : { method: 'mgPerUnit', mgPerUnit: numOrZero(api.potMgPerUnit), unitWeightG: numOrZero(api.potUnitWeightG) };
}

export default function FormulateApp() {
  const [mode, setMode] = useState<Mode>('fresh');
  const [activeTab, setActiveTab] = useState<TabKey>('output');
  const [loadedRun, setLoadedRun] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  // Upfront naming: a new run's fields stay locked (see InputsPanel's
  // `disabled` prop / NewRunModal) until a name is chosen. Loading a run from
  // history sets these directly, bypassing the modal (see loadRun below).
  const [runName, setRunName] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');

  // Chrome/Firefox both let mouse-wheel/trackpad scroll over a *focused*
  // number input silently bump its value by `step` — no scrollbar cue, no
  // visible spinner interaction. A user scrolling the page while the cursor
  // happens to cross a still-focused field (e.g. right after typing a value)
  // gets their number decremented/incremented without knowing it. Blurring
  // the input on wheel restores normal page-scroll behavior for every
  // number field in the app, current and future, from one place.
  useEffect(() => {
    function blurNumberInputOnWheel(e: WheelEvent) {
      const target = e.target;
      if (target instanceof HTMLInputElement && target.type === 'number') {
        target.blur();
      }
    }
    document.addEventListener('wheel', blurNumberInputOnWheel, { passive: true });
    return () => document.removeEventListener('wheel', blurNumberInputOnWheel);
  }, []);

  const [apis, setApis] = useState<FreshApiState[]>(() => [blankApi('', 'active')]);
  const [fPotMethod, setFPotMethod] = useState<FreshPotencyMethod>('bulkPercent');
  const [fTwt, setFTwt] = useState('');
  const [fTabs, setFTabs] = useState('');
  const [freshSolveMode, setFreshSolveMode] = useState(false);
  const [fFillerType, setFFillerType] = useState<string>('Emdex');
  const [excipientPercents, setExcipientPercents] = useState<Record<string, string>>({});

  function setExcipientPercent(id: string, value: string) {
    setExcipientPercents((prev) => ({ ...prev, [id]: value }));
  }

  function updateApi(id: string, patch: Partial<FreshApiState>) {
    setApis((prev) => prev.map((api) => (api.id === id ? { ...api, ...patch } : api)));
  }

  function addApi() {
    setApis((prev) => [...prev, blankApi('')]);
  }

  function removeApi(id: string) {
    setApis((prev) => (prev.length <= 1 ? prev : prev.filter((api) => api.id !== id)));
  }

  const [lots, setLots] = useState<RegrindLotState[]>(() => [blankLot('Lot 1')]);
  const [rgPwd, setRgPwd] = useState('');
  const [rgTmg, setRgTmg] = useState('');
  const [rgTwt, setRgTwt] = useState('');
  const [regrindSolveMode, setRegrindSolveMode] = useState(false);
  const [rgTargetTablets, setRgTargetTablets] = useState('');

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
      fillerType: preset.fillerType ?? '',
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
          fillerType: lot.fillerType === '' ? null : lot.fillerType,
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
  const lubricantIngredient = baseIngredients.find((i) => i.role === 'lubricant')!;
  const excipients = useMemo(
    () => baseIngredients.filter((i) => i.role !== 'active' && !i.calculatedByDifference),
    [baseIngredients]
  );
  // Lubricant is excluded here — it always gets a small fresh top-up in
  // regrind mode (see lubricantTopUpG), so it no longer belongs in the
  // blanket "don't add fresh" list alongside disintegrant.
  const alreadyPresentNames = baseIngredients.filter((i) => i.role === 'disintegrant').map((i) => i.name);

  // `ingredients` passed to calculateFreshBatch must not include the
  // active-role entry — active ingredients now come entirely from `apis`.
  const freshIngredients = useMemo<IngredientLine[]>(
    () =>
      baseIngredients
        .filter((i) => i.role !== 'active')
        .map((i) => {
          if (i.calculatedByDifference) return i;
          return { ...i, percentOfBlend: numOrZero(excipientPercents[i.id] ?? '') };
        }),
    [baseIngredients, excipientPercents]
  );

  const freshApiEntries = useMemo<FreshApiEntry[]>(
    () =>
      apis.map((api, index) => ({
        id: api.id,
        label: api.label.trim() || (index === 0 ? 'API' : `API ${index + 1}`),
        targetActiveMgPerTablet: numOrZero(api.targetMg),
        potency: apiStateToPotency(fPotMethod, api),
      })),
    [apis, fPotMethod]
  );

  // Live preview of the auto-filler %, mirroring the same derivation
  // calculateFreshBatch performs internally (potency is raw-material purity,
  // not the active ingredient's direct % of blend) — summed across every API.
  const targetWtNum = numOrZero(fTwt);
  const derivedActivePercent = useMemo(() => {
    if (targetWtNum <= 0) return 0;
    return apis.reduce((sum, api) => {
      const potencyFraction =
        fPotMethod === 'bulkPercent'
          ? numOrZero(api.potPercent) / 100
          : (() => {
              const mgPerUnit = numOrZero(api.potMgPerUnit);
              const unitWeightG = numOrZero(api.potUnitWeightG);
              return mgPerUnit > 0 && unitWeightG > 0 ? mgPerUnit / (unitWeightG * 1000) : 0;
            })();
      const targetMgNum = numOrZero(api.targetMg);
      if (potencyFraction <= 0 || targetMgNum <= 0) return sum;
      const rawMaterialMgPerTablet = targetMgNum / potencyFraction;
      return sum + (rawMaterialMgPerTablet / (targetWtNum * 1000)) * 100;
    }, 0);
  }, [apis, fPotMethod, targetWtNum]);
  const excipientPercentSum = excipients.reduce(
    (sum, i) => sum + numOrZero(excipientPercents[i.id] ?? ''),
    0
  );
  const fillerDisplay = Math.max(0, 100 - derivedActivePercent - excipientPercentSum).toFixed(2);

  const freshSolveApiEntries = useMemo<FreshApiStockEntry[]>(
    () =>
      apis.map((api, index) => ({
        id: api.id,
        label: api.label.trim() || (index === 0 ? 'API' : `API ${index + 1}`),
        targetActiveMgPerTablet: numOrZero(api.targetMg),
        potency: apiStateToPotency(fPotMethod, api),
        availableStockG: numOrZero(api.availableStockG),
      })),
    [apis, fPotMethod]
  );

  const freshSolveOutcome = useMemo(() => {
    if (!freshSolveMode) return null;
    return solveFreshBatchMaxTablets({ apis: freshSolveApiEntries });
  }, [freshSolveMode, freshSolveApiEntries]);

  // Not shown to the user directly — surfaced as OutputPanel's emptyMessage below.
  const freshSolveError = freshSolveMode && freshSolveOutcome && !freshSolveOutcome.ok ? freshSolveOutcome.reason : null;

  const freshResult = useMemo(() => {
    if (freshSolveMode && (!freshSolveOutcome || !freshSolveOutcome.ok)) return null;
    try {
      return calculateFreshBatch({
        tabletCount: freshSolveMode && freshSolveOutcome?.ok ? freshSolveOutcome.tabletCount : numOrZero(fTabs),
        targetWeightG: numOrZero(fTwt),
        apis: freshApiEntries,
        ingredients: freshIngredients,
        fillerType: fFillerType,
      });
    } catch {
      return null;
    }
  }, [freshSolveMode, freshSolveOutcome, fTabs, fTwt, freshApiEntries, freshIngredients, fFillerType]);

  // Per-API "stock used vs. available" breakdown, only meaningful in solve
  // mode once solving succeeds — combines the solve outcome's availableStockG
  // per API with the actual grams calculateFreshBatch used for that same
  // tabletCount (result.apis[].gramsPerRun), reusing that already-tested
  // figure rather than recomputing stock usage here.
  const apiStockBreakdown = useMemo(() => {
    if (!freshSolveMode || !freshSolveOutcome?.ok || !freshResult) return null;
    return freshSolveOutcome.perApi.map((p) => {
      const usedG = freshResult.apis.find((a) => a.id === p.id)?.gramsPerRun ?? 0;
      return {
        id: p.id,
        label: p.label,
        availableStockG: p.availableStockG,
        usedG,
        leftoverG: p.availableStockG - usedG,
        isLimiting: p.isLimiting,
        maxTabletsFromThisAPI: p.maxTabletsFromThisAPI,
      };
    });
  }, [freshSolveMode, freshSolveOutcome, freshResult]);

  const regrindLots = useMemo<RegrindLot[]>(
    () =>
      lots.map((lot) => ({
        id: lot.id,
        label: lot.label,
        potency: lotStateToPotency(lot),
        weightG: numOrZero(lot.weightG),
        disintegrantPercent: lot.disintegrantPercent === '' ? null : numOrZero(lot.disintegrantPercent),
        lubricantPercent: lot.lubricantPercent === '' ? null : numOrZero(lot.lubricantPercent),
        fillerType: lot.fillerType,
        availableStockG: lot.availableStockG === '' ? null : numOrZero(lot.availableStockG),
        sourceType: lot.sourceType,
        isStart: lot.isStart,
        note: lot.note,
      })),
    [lots]
  );

  // Solve-mode validation: exactly one lot must be marked "solve for amount
  // needed" — zero or multiple is a blocking, user-visible error rather than
  // an ordinary null result.
  const regrindSolveValidationError = useMemo(() => {
    if (!regrindSolveMode) return null;
    const solvingCount = lots.filter((l) => l.isSolving).length;
    if (solvingCount === 0) return 'Mark exactly one lot "Solve for amount needed" before calculating.';
    if (solvingCount > 1) return 'Only one lot can be marked "Solve for amount needed" at a time — uncheck the extras.';
    return null;
  }, [regrindSolveMode, lots]);

  const regrindSolveOutcome = useMemo(() => {
    if (!regrindSolveMode || regrindSolveValidationError) return null;
    const solvingLotId = lots.find((l) => l.isSolving)!.id;
    const fixedLots = regrindLots
      .filter((l) => l.id !== solvingLotId)
      .map((l) => ({ weightG: l.weightG, potency: l.potency, sourceType: l.sourceType }));
    const solvingLot = regrindLots.find((l) => l.id === solvingLotId)!;
    return solveRegrindLotWeight({
      fixedLots,
      solvingLotPotency: solvingLot.potency,
      solvingLotSourceType: solvingLot.sourceType,
      targetTabletCount: numOrZero(rgTargetTablets),
      targetActiveMgPerTablet: numOrZero(rgTmg),
      targetWeightG: numOrZero(rgTwt),
    });
  }, [regrindSolveMode, regrindSolveValidationError, lots, regrindLots, rgTargetTablets, rgTmg, rgTwt]);

  // Not shown to the user directly — surfaced via regrindSolveError below,
  // which also covers the "exactly one lot marked" validation case.
  const regrindSolveError =
    regrindSolveMode && (regrindSolveValidationError || (regrindSolveOutcome && !regrindSolveOutcome.ok))
      ? regrindSolveValidationError ?? (regrindSolveOutcome as { ok: false; reason: string }).reason
      : null;

  // The lot being solved for, with its computed weight filled in — feeds
  // into the exact same (unmodified) calculateRegrind used for the normal,
  // all-weights-known flow, so solve mode reuses that already-tested math
  // rather than duplicating it.
  const resolvedRegrindLots = useMemo<RegrindLot[]>(() => {
    if (regrindSolveMode && regrindSolveOutcome?.ok) {
      const solvingLotId = lots.find((l) => l.isSolving)?.id;
      return regrindLots.map((l) =>
        l.id === solvingLotId ? { ...l, weightG: regrindSolveOutcome.solvedWeightG } : l
      );
    }
    return regrindLots;
  }, [regrindSolveMode, regrindSolveOutcome, lots, regrindLots]);

  const solvedLotDisplay = useMemo(() => {
    if (!regrindSolveMode || !regrindSolveOutcome?.ok) return null;
    const solvingLot = lots.find((l) => l.isSolving);
    if (!solvingLot) return null;
    return { label: solvingLot.label, weightG: regrindSolveOutcome.solvedWeightG };
  }, [regrindSolveMode, regrindSolveOutcome, lots]);

  // Only meaningful when regrindSolveMode is on and solving succeeded — the
  // total lot weight (solved lot included), which becomes the authoritative
  // regroundPowderG fed into calculateRegrind, and what gets persisted as
  // rgPwd when the run is saved (see performAutosave / verifyInputsSnapshot).
  const solvedTotalRegroundPowderG = useMemo(
    () => resolvedRegrindLots.reduce((sum, l) => sum + l.weightG, 0),
    [resolvedRegrindLots]
  );

  const regrindResult = useMemo(() => {
    if (regrindSolveMode) {
      if (regrindSolveError || !regrindSolveOutcome?.ok) return null;
      return calculateRegrind({
        lots: resolvedRegrindLots,
        regroundPowderG: solvedTotalRegroundPowderG,
        targetActiveMgPerTablet: numOrZero(rgTmg),
        targetWeightG: numOrZero(rgTwt),
        // EasyTab, not the shared fresh-batch Emdex/Dipac filler — regrind's
        // calculated bulk filler and the fixed 0.15% EasyTab processing aid
        // are the same material, merged into one output/SOP line below.
        fillerIngredientName: 'EasyTab',
        alreadyPresentIngredientNames: alreadyPresentNames,
        lubricantTopUpIngredientName: lubricantIngredient.name,
      });
    }
    return calculateRegrind({
      lots: regrindLots,
      regroundPowderG: numOrZero(rgPwd),
      targetActiveMgPerTablet: numOrZero(rgTmg),
      targetWeightG: numOrZero(rgTwt),
      // EasyTab, not the shared fresh-batch Emdex/Dipac filler — regrind's
      // calculated bulk filler and the fixed 0.15% EasyTab processing aid
      // are the same material, merged into one output/SOP line below.
      fillerIngredientName: 'EasyTab',
      alreadyPresentIngredientNames: alreadyPresentNames,
      lubricantTopUpIngredientName: lubricantIngredient.name,
    });
  }, [
    regrindSolveMode,
    regrindSolveError,
    regrindSolveOutcome,
    resolvedRegrindLots,
    solvedTotalRegroundPowderG,
    regrindLots,
    rgPwd,
    rgTmg,
    rgTwt,
    alreadyPresentNames,
    lubricantIngredient,
  ]);

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
    // Fresh batch is built directly to the target blend, so
    // activePercentOfBlend already is the finished-tablet potency. Regrind's
    // effectivePotency is the reground powder's OWN potency, before Emdex,
    // lubricant top-up, EasyTab, and Silicon Dioxide are added — not the
    // final tablet blend's potency (see finalBlendPotency below).
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
      potencyLabel: result.mode === 'fresh' ? 'Active potency' : 'Reground powder potency',
      potency: potencyPercent.toFixed(3) + '%',
      // Actual final blend potency once every addition is included —
      // reconciles with Verified mg/tab (this × target tablet weight ≈ that).
      finalBlendPotency:
        result.mode === 'regrind' && result.totalBlendG > 0
          ? ((result.activeInOldPowderG / result.totalBlendG) * 100).toFixed(3) + '%'
          : undefined,
      mgPerTab: mgPerTab.toFixed(result.mode === 'regrind' ? 3 : 1) + ' mg',
    };
  }, [result]);

  const addRows: AddRowData[] = useMemo(() => {
    if (!result) return [];
    if (result.mode === 'fresh') {
      // One row per API (always, even at 0g — see below), then one row per
      // non-API ingredient with a defined role. An untouched or zero
      // excipient should be visibly 0, never silently absent, so it can't
      // be mistaken for "not part of this formulation."
      const apiRows: AddRowData[] = result.apis.map((api) => ({
        label: `${api.label} active`,
        value: `${fmt(result.ingredientGrams[api.id] ?? 0, 2)} g`,
        icon: 'plus',
        key: true,
      }));
      const otherRows: AddRowData[] = freshIngredients.map((ing) => {
        const grams = result.ingredientGrams[ing.id] ?? 0;
        const isFiller = ing.calculatedByDifference;
        return {
          label: isFiller ? result.fillerType : ing.name,
          value: `${fmt(grams, 2)} g`,
          icon: isFiller ? 'cube' : 'circle-plus',
          key: isFiller,
        };
      });
      return [...apiRows, ...otherRows];
    }
    const solvedRow: AddRowData[] = solvedLotDisplay
      ? [
          {
            label: `${solvedLotDisplay.label} needed`,
            value: `${fmt(solvedLotDisplay.weightG, 1)} g`,
            icon: 'calculator',
            key: true,
          },
        ]
      : [];
    return [
      ...solvedRow,
      { label: 'Reground powder', value: `${fmt(result.regroundPowderG, 0)} g`, icon: 'reload', key: false },
      {
        label: `Fresh ${activeIngredient.name} to add`,
        value: result.freshActiveG > 0 ? `${fmt(result.freshActiveG)} g` : 'Not needed',
        icon: 'plus',
        key: result.freshActiveG > 0,
      },
      {
        // Bulk calculated filler + the fixed 0.15% EasyTab processing aid are
        // the same material, merged into one line rather than two.
        label: `${result.fillerIngredientName} to add`,
        value: `${fmt(result.fillerAddG + result.easyTabG)} g`,
        icon: 'cube',
        key: true,
      },
      // Only shown when at least one lot is marked reground-tablets — a
      // batch made entirely of raw/bulk powder gets no top-up at all.
      ...(result.lubricantTopUpG > 0
        ? [
            {
              label: `${result.lubricantTopUpIngredientName} (0.15% fresh top-up)`,
              value: `${fmt(result.lubricantTopUpG, 2)} g`,
              icon: 'droplet',
              key: false,
            },
          ]
        : []),
      // Standard processing aid added to every regrind batch regardless of
      // lot sourceType — no "already present" concern like the lubricant
      // top-up or PVPP, so always shown, not conditional. EasyTab itself is
      // not a separate row here — its 0.15% is merged into the filler row above.
      {
        label: result.siliconDioxideIngredientName,
        value: `${fmt(result.siliconDioxideG, 2)} g`,
        icon: 'circle-plus',
        key: false,
      },
    ];
  }, [result, activeIngredient, freshIngredients, solvedLotDisplay]);

  const warnRows: string[] = useMemo(() => {
    if (!result || result.mode !== 'regrind') return [];
    const rows: string[] = [];
    if (result.alreadyPresentIngredientNames.length > 0) {
      rows.push(`Do not add fresh ${result.alreadyPresentIngredientNames.join(' or ')} — already present in regrind`);
    }
    // Only relevant when there's actually a top-up to add — see addRows above.
    if (result.lubricantTopUpG > 0) {
      rows.push(
        `${result.lubricantTopUpIngredientName} is already present in regrind — add only the 0.15% fresh top-up (${fmt(result.lubricantTopUpG, 2)} g) shown above, not a full fresh addition`
      );
    }
    if (result.regroundPowderMismatch) {
      rows.push(
        `Total reground powder weight (${fmt(result.regroundPowderG, 0)} g) doesn't match the sum of lot weights (${fmt(result.lotWeightSum, 0)} g) — re-check before proceeding`
      );
    }
    for (const lot of result.lots) {
      if (lot.availableStockG != null && lot.weightG > lot.availableStockG) {
        rows.push(
          `Lot "${lot.label}" needs ${fmt(lot.weightG, 1)} g but only ${fmt(lot.availableStockG, 1)} g is available in stock`
        );
      }
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
      fillerType: lot.fillerType,
      isRawPowder: lot.sourceType === 'rawPowder',
    }));
  }, [result]);

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifyDiscrepancy, setVerifyDiscrepancy] = useState<VerifyDiscrepancy | null>(null);
  const [verifyAcknowledgedAt, setVerifyAcknowledgedAt] = useState<string | null>(null);

  const verifyInputsSnapshot = useMemo(
    () =>
      mode === 'fresh'
        ? {
            apis: freshSolveMode ? freshSolveApiEntries : freshApiEntries,
            potencyMethod: fPotMethod,
            fTwt,
            fTabs: freshSolveMode && freshSolveOutcome?.ok ? String(freshSolveOutcome.tabletCount) : fTabs,
            excipients: excipientPercents,
            fillerType: fFillerType,
            freshSolveMode,
          }
        : {
            lots: regrindSolveMode ? resolvedRegrindLots : regrindLots,
            rgPwd: regrindSolveMode ? String(solvedTotalRegroundPowderG) : rgPwd,
            rgTmg,
            rgTwt,
            regrindSolveMode,
            rgTargetTablets,
          },
    [
      mode,
      freshApiEntries,
      freshSolveMode,
      freshSolveApiEntries,
      freshSolveOutcome,
      fPotMethod,
      fTwt,
      fTabs,
      excipientPercents,
      fFillerType,
      regrindSolveMode,
      resolvedRegrindLots,
      solvedTotalRegroundPowderG,
      regrindLots,
      rgPwd,
      rgTmg,
      rgTwt,
      rgTargetTablets,
    ]
  );

  // Identifies the exact inputs+result a verification result was computed
  // against, so a later input change can be detected and surfaced as stale
  // rather than silently leaving a check that no longer matches.
  const [verifiedSnapshotKey, setVerifiedSnapshotKey] = useState<string | null>(null);
  const currentSnapshotKey = useMemo(
    () => (result ? JSON.stringify({ mode, verifyInputsSnapshot, result }) : null),
    [result, mode, verifyInputsSnapshot]
  );
  const verifyStale =
    verifyStatus !== 'idle' &&
    verifyStatus !== 'checking' &&
    verifiedSnapshotKey !== null &&
    verifiedSnapshotKey !== currentSnapshotKey;

  useEffect(() => {
    if (!result) {
      setVerifyStatus('idle');
      setVerifyNotes('');
      setVerifyDiscrepancy(null);
      setVerifyAcknowledgedAt(null);
      setVerifiedSnapshotKey(null);
    }
  }, [result]);

  async function runVerification() {
    if (!result) return;
    const snapshotKey = currentSnapshotKey;

    setVerifyStatus('checking');
    setVerifyNotes('');
    setVerifyDiscrepancy(null);
    setVerifyAcknowledgedAt(null);

    try {
      const res = await fetch('/api/ai/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, inputs: verifyInputsSnapshot, result }),
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
    } catch {
      setVerifyStatus('error');
      setVerifyNotes('Verification unavailable right now.');
    }
    setVerifiedSnapshotKey(snapshotKey);
  }

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
    // Loading an existing run isn't "starting a new run" — it's already
    // named and already saved, so skip the naming modal entirely.
    setRunName(run.label);
    setShowNamePrompt(false);
    setAutosaveStatus('saved');
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
              fillerType: l.fillerType ?? '',
              availableStockG: l.availableStockG != null ? String(l.availableStockG) : '',
              // Runs saved before this field existed default to
              // 'regroundTablets', matching their original (pre-source-type)
              // math exactly.
              sourceType: l.sourceType ?? 'regroundTablets',
              // Solve mode is never re-entered on load — a saved run always
              // stores the final, resolved lot weights (see performAutosave/buildRunInputs), so
              // every lot restores as an ordinary fixed-weight lot.
              isSolving: false,
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
            fillerType: '',
            availableStockG: '',
            sourceType: 'regroundTablets',
            isSolving: false,
            isStart: false,
            note: '',
          },
        ]);
      }
      setRgPwd(str('rgPwd'));
      setRgTmg(str('rgTmg'));
      setRgTwt(str('rgTwt'));
      // Always restore into the ordinary, all-weights-known flow — a saved
      // run's lots already carry their final resolved weights either way.
      setRegrindSolveMode(false);
      setRgTargetTablets('');
    } else {
      setMode('fresh');
      const savedApis = inputs.apis;
      if (Array.isArray(savedApis) && savedApis.length > 0) {
        const method = (inputs.potencyMethod as FreshPotencyMethod) || 'bulkPercent';
        setFPotMethod(method);
        setApis(
          savedApis.map((raw, index) => {
            const a = raw as Partial<FreshApiEntry> & { id?: string; label?: string };
            const potency = a.potency as FreshApiPotency | undefined;
            return {
              id: a.id || makeApiId(),
              label: a.label || (index === 0 ? 'API' : `API ${index + 1}`),
              targetMg: a.targetActiveMgPerTablet != null ? String(a.targetActiveMgPerTablet) : '',
              potPercent: potency?.method === 'bulkPercent' ? String(potency.percent) : '',
              potMgPerUnit: potency?.method === 'mgPerUnit' ? String(potency.mgPerUnit) : '',
              potUnitWeightG: potency?.method === 'mgPerUnit' ? String(potency.unitWeightG) : '',
              availableStockG: '',
            };
          })
        );
      } else {
        // Backward compat: runs saved before multi-API support used flat
        // fName/fPot/fTmg fields for a single implicit API.
        setFPotMethod('bulkPercent');
        setApis([
          {
            id: 'active',
            label: str('fName') || 'API',
            targetMg: str('fTmg'),
            potPercent: str('fPot'),
            potMgPerUnit: '',
            potUnitWeightG: '',
            availableStockG: '',
          },
        ]);
      }
      setFTwt(str('fTwt'));
      setFTabs(str('fTabs'));
      setFFillerType((inputs.fillerType as string) || 'Emdex');
      // Solve mode is never re-entered on load — a saved run always stores
      // the final, resolved tablet count and API grams (see performAutosave/buildRunInputs), so it
      // always restores into the ordinary manual-tablet-count flow.
      setFreshSolveMode(false);
      // Backward compat: runs saved before excipients became generic stored
      // fixed fMags/fPvpp fields instead of a per-ingredient map.
      const legacy: Record<string, string> = {};
      if (typeof inputs.fMags === 'string') legacy.magstearate = inputs.fMags;
      if (typeof inputs.fPvpp === 'string') legacy.pvpp = inputs.fPvpp;
      const savedExcipients = (inputs.excipients as Record<string, string> | undefined) ?? {};
      setExcipientPercents({ ...legacy, ...savedExcipients });
    }
  }

  function buildRunInputs() {
    return mode === 'fresh'
      ? {
          apis: freshApiEntries,
          potencyMethod: fPotMethod,
          fTwt,
          // Solved runs persist the final resolved tablet count, not the
          // (unused) manual field — mirrors regrind's solved regroundPowderG.
          fTabs: freshSolveMode && freshSolveOutcome?.ok ? String(freshSolveOutcome.tabletCount) : fTabs,
          excipients: excipientPercents,
          fillerType: fFillerType,
        }
      : {
          lots: regrindSolveMode ? resolvedRegrindLots : regrindLots,
          rgPwd: regrindSolveMode ? String(solvedTotalRegroundPowderG) : rgPwd,
          rgTmg,
          rgTwt,
          regrindSolveMode,
          rgTargetTablets,
        };
  }

  function buildVerificationAcknowledgment() {
    return verifyStatus === 'acknowledged' && verifyDiscrepancy && verifyAcknowledgedAt
      ? {
          acknowledgedAt: verifyAcknowledgedAt,
          field: verifyDiscrepancy.field,
          reportedValue: verifyDiscrepancy.reportedValue,
          computedValue: verifyDiscrepancy.computedValue,
          delta: verifyDiscrepancy.computedValue - verifyDiscrepancy.reportedValue,
          unit: verifyDiscrepancy.unit,
        }
      : null;
  }

  // Guards the upsert against overlapping requests: without this, two
  // autosaves firing close together (e.g. a slow network) could both see
  // loadedRun as null and each POST a new run instead of the second one
  // PATCHing the first's id — exactly the duplicate this feature must avoid.
  // A save already in flight is followed by at most one more once it settles,
  // always via the ref so that retry uses the latest inputs/result, not
  // whatever was captured in the original (possibly now-stale) closure.
  const savingInFlightRef = useRef(false);
  const dirtyRef = useRef(false);
  const autosaveRef = useRef<() => void>(() => {});

  async function performAutosave() {
    if (!result || !runName) return;
    if (savingInFlightRef.current) {
      dirtyRef.current = true;
      return;
    }
    savingInFlightRef.current = true;
    setAutosaveStatus('saving');
    try {
      const payload = {
        label: runName,
        mode,
        inputs: buildRunInputs(),
        result,
        verificationAcknowledgment: buildVerificationAcknowledgment(),
      };
      const res = loadedRun
        ? await fetch(`/api/runs/${loadedRun}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/runs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        setAutosaveStatus('error');
        return;
      }
      const saved: RunRecord = await res.json();
      setRuns((prev) =>
        prev.some((r) => r.id === saved.id) ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev]
      );
      setLoadedRun(saved.id);
      setAutosaveStatus('saved');
    } catch {
      setAutosaveStatus('error');
    } finally {
      savingInFlightRef.current = false;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        autosaveRef.current();
      }
    }
  }

  useEffect(() => {
    autosaveRef.current = performAutosave;
  });

  // Debounced autosave: fires ~1.5s after inputs settle into a valid result,
  // rather than on every keystroke. `result` already changes reference on any
  // input that affects it, so depending on it alone is enough to both trigger
  // and (via the effect cleanup) restart the debounce on each new change.
  useEffect(() => {
    if (showNamePrompt || !runName || !result) return;
    const timer = setTimeout(() => {
      autosaveRef.current();
    }, 1500);
    return () => clearTimeout(timer);
  }, [showNamePrompt, runName, result]);

  function handleNameSubmit(name: string) {
    setRunName(name);
    setShowNamePrompt(false);
  }

  function resetForm() {
    setLoadedRun(null);
    setRunName('');
    setShowNamePrompt(true);
    setAutosaveStatus('idle');
    savingInFlightRef.current = false;
    dirtyRef.current = false;
    setApis([blankApi('', 'active')]);
    setFPotMethod('bulkPercent');
    setFTwt('');
    setFTabs('');
    setFreshSolveMode(false);
    setFFillerType('Emdex');
    setExcipientPercents({});
    setLots([blankLot('Lot 1')]);
    setRgPwd('');
    setRgTmg('');
    setRgTwt('');
    setRegrindSolveMode(false);
    setRgTargetTablets('');
  }

  // Drives TipsCard's "Option B" tip — only relevant once potency is
  // actually being entered that way, not just because the mode supports it.
  const usingOptionB = mode === 'fresh' ? fPotMethod === 'mgPerUnit' : lots.some((lot) => lot.opt === 'b');

  return (
    <>
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar
          mode={mode}
          runName={runName}
          autosaveStatus={autosaveStatus}
          onReset={resetForm}
          onPrint={() => window.print()}
          canPrint={!!result}
        />
        <div className="content">
          <div className="col-left" style={{ position: 'relative' }}>
            {showNamePrompt && <NewRunModal mode={mode} onSubmit={handleNameSubmit} />}
            <InputsPanel
              mode={mode}
              disabled={showNamePrompt}
              onModeChange={setMode}
              apis={apis}
              onUpdateApi={updateApi}
              onAddApi={addApi}
              onRemoveApi={removeApi}
              potencyMethod={fPotMethod}
              onPotencyMethodChange={setFPotMethod}
              fTwt={fTwt}
              setFTwt={setFTwt}
              fTabs={fTabs}
              setFTabs={setFTabs}
              freshSolveMode={freshSolveMode}
              onFreshSolveModeChange={setFreshSolveMode}
              excipients={excipients}
              excipientPercents={excipientPercents}
              setExcipientPercent={setExcipientPercent}
              fillerType={fFillerType}
              onFillerTypeChange={setFFillerType}
              fillerDisplay={fillerDisplay}
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
              regrindSolveMode={regrindSolveMode}
              onRegrindSolveModeChange={setRegrindSolveMode}
              rgTargetTablets={rgTargetTablets}
              setRgTargetTablets={setRgTargetTablets}
              solvedWeightG={solvedLotDisplay?.weightG ?? null}
            />
          </div>

          <div className="col-mid">
            <VerifyIndicator
              status={verifyStatus}
              notes={verifyNotes}
              discrepancy={verifyDiscrepancy}
              onAcknowledge={acknowledgeDiscrepancy}
              canVerify={!!result}
              stale={verifyStale}
              onVerify={runVerification}
            />
            <OutputPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              hasResult={!!result}
              stats={stats}
              addRows={addRows}
              warnRows={warnRows}
              lotBreakdown={lotBreakdown}
              apiStockBreakdown={apiStockBreakdown}
              varianceRows={varianceRows}
              sopSteps={sopSteps}
              emptyMessage={mode === 'regrind' ? regrindSolveError : freshSolveError}
            />
          </div>

          <div className="col-right">
            <RunHistoryPanel runs={runs} loading={runsLoading} loadedRun={loadedRun} onLoadRun={loadRun} />
            <TipsCard mode={mode} usingOptionB={usingOptionB} />
          </div>
        </div>
      </div>
    </div>

    {/* Print-only combined Output + Variances + SOP sheet — hidden on
        screen (see .print-sheet in globals.css), shown via @media print
        while the rest of .app is hidden. Kept as one flat, always-rendered
        block rather than a portal/print-time DOM swap so window.print()
        just works with no extra wiring. */}
    <div className="print-sheet">
      <div className="print-hdr">
        <h1>Batch Instructions</h1>
        <div className="print-meta">
          <div>
            <strong>Run:</strong> {runName || `Unnamed ${mode === 'fresh' ? 'fresh batch' : 'regrind'} run`}
          </div>
          <div>
            <strong>Mode:</strong> {mode === 'fresh' ? 'Fresh batch' : 'Regrind'}
          </div>
          <div>
            <strong>Printed:</strong>{' '}
            <span suppressHydrationWarning>{new Date().toLocaleString()}</span>
          </div>
          {mode === 'regrind' && lots.length > 0 && (
            <div>
              <strong>Lots:</strong> {lots.map((l) => l.label).join(', ')}
            </div>
          )}
        </div>
      </div>

      {result && stats && (
        <section className="print-section">
          <h2>Output</h2>
          <div className="print-stats">
            <div>
              <span>Tablets</span>
              <strong>{stats.tablets}</strong>
            </div>
            <div>
              <span>Total blend</span>
              <strong>{stats.blend} g</strong>
            </div>
            <div>
              <span>{stats.potencyLabel}</span>
              <strong>{stats.potency}</strong>
            </div>
            {stats.finalBlendPotency && (
              <div>
                <span>% of API in batch total</span>
                <strong>{stats.finalBlendPotency}</strong>
              </div>
            )}
            <div>
              <span>Verified mg / tab</span>
              <strong>{stats.mgPerTab}</strong>
            </div>
          </div>

          <h3>Add to V-mix</h3>
          <table className="print-tbl">
            <tbody>
              {addRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {warnRows.length > 0 && (
            <>
              <h3>Warnings</h3>
              <ul className="print-warn-list">
                {warnRows.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          )}

          {lotBreakdown && (
            <>
              <h3>Lot breakdown</h3>
              <table className="print-tbl">
                <tbody>
                  {lotBreakdown.map((lot) => (
                    <tr key={lot.label}>
                      <td>
                        {lot.label}
                        {lot.fillerType ? ` — ${lot.fillerType}` : ''}
                        {lot.isRawPowder ? ' (raw powder)' : ''}
                        {lot.isStart ? ' (starts — low confidence)' : ''}
                      </td>
                      <td>
                        {lot.weightG.toLocaleString('en-US', { maximumFractionDigits: 0 })} g @{' '}
                        {lot.potencyPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {varianceRows.length > 0 && (
        <section className="print-section">
          <h2>Variances</h2>
          <table className="print-tbl print-var-tbl">
            <thead>
              <tr>
                <th>Weight (g)</th>
                <th>Step</th>
                <th>Potency (mg)</th>
              </tr>
            </thead>
            <tbody>
              {varianceRows.map((row) => (
                <tr key={row.step} className={row.step === 0 ? 'print-tgt' : ''}>
                  <td>{row.weightG.toFixed(3)}</td>
                  <td>
                    {row.step >= 0 ? '+' : ''}
                    {row.step}
                  </td>
                  <td>{row.potencyMg.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {sopSteps.length > 0 && (
        <section className="print-section">
          <h2>SOP</h2>
          <ol className="print-sop-list">
            {sopSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
    </>
  );
}
