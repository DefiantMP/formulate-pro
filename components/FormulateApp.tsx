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
import type { IngredientLine, PotencyInput } from '@/lib/calc-engine/types';
import { fmt, fmtK, numOrZero } from '@/lib/format';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import InputsPanel from './InputsPanel';
import OutputPanel, { type AddRowData, type StatsData, type TabKey } from './OutputPanel';
import RunHistoryPanel, { type RunRecord } from './RunHistoryPanel';
import TipsCard from './TipsCard';
import VerifyIndicator, { type VerifyDiscrepancy, type VerifyStatus } from './VerifyIndicator';

const VERIFY_DEBOUNCE_MS = 800;

export type Mode = 'fresh' | 'regrind';
export type RegrindOption = 'a' | 'b';

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

  const [opt, setOpt] = useState<RegrindOption>('a');
  const [aPot, setAPot] = useState('');
  const [bMg, setBMg] = useState('');
  const [bWt, setBWt] = useState('');
  const [rgPwd, setRgPwd] = useState('');
  const [rgTmg, setRgTmg] = useState('');
  const [rgTwt, setRgTwt] = useState('');

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

  const regrindResult = useMemo(() => {
    const potency: PotencyInput =
      opt === 'a'
        ? { method: 'bulkPercent', percent: numOrZero(aPot) }
        : { method: 'mgPerTablet', mgPerOldTablet: numOrZero(bMg), oldTabletWeightG: numOrZero(bWt) };
    return calculateRegrind({
      potency,
      regroundPowderG: numOrZero(rgPwd),
      targetActiveMgPerTablet: numOrZero(rgTmg),
      targetWeightG: numOrZero(rgTwt),
      fillerIngredientName: fillerIngredient.name,
      alreadyPresentIngredientNames: alreadyPresentNames,
    });
  }, [opt, aPot, bMg, bWt, rgPwd, rgTmg, rgTwt, fillerIngredient, alreadyPresentNames]);

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

  const warnRow =
    result && result.mode === 'regrind'
      ? `Do not add fresh ${result.alreadyPresentIngredientNames.join(' or ')} — already present in regrind`
      : null;

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
        : { opt, aPot, bMg, bWt, rgPwd, rgTmg, rgTwt };

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
  }, [result, mode, fName, fPot, fTmg, fTwt, fTabs, excipientPercents, opt, aPot, bMg, bWt, rgPwd, rgTmg, rgTwt]);

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
      setOpt((inputs.opt as RegrindOption) || 'a');
      setAPot(str('aPot'));
      setBMg(str('bMg'));
      setBWt(str('bWt'));
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
        : { opt, aPot, bMg, bWt, rgPwd, rgTmg, rgTwt };

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
    setAPot('');
    setBMg('');
    setBWt('');
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
              opt={opt}
              onOptChange={setOpt}
              aPot={aPot}
              setAPot={setAPot}
              bMg={bMg}
              setBMg={setBMg}
              bWt={bWt}
              setBWt={setBWt}
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
              warnRow={warnRow}
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
