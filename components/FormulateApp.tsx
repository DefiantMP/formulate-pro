'use client';

import { useMemo, useState } from 'react';
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
import RunHistoryPanel, { type RunMeta } from './RunHistoryPanel';
import TipsCard from './TipsCard';

export type Mode = 'fresh' | 'regrind';
export type RegrindOption = 'a' | 'b';

interface FreshPreset {
  mode: 'fresh';
  pot: number;
  tMg: number;
  tWt: number;
  tabs: number;
  mags: number;
  pvpp: number;
}
interface RegrindPreset {
  mode: 'regrind';
  opt: RegrindOption;
  aPot?: number;
  bMg?: number;
  bWt?: number;
  pwd: number;
  tMg: number;
  tWt: number;
}
type Preset = FreshPreset | RegrindPreset;

const presets: Preset[] = [
  { mode: 'regrind', opt: 'b', bMg: 20.1, bWt: 0.27, pwd: 14500, tMg: 35, tWt: 0.8 },
  { mode: 'fresh', pot: 55.5, tMg: 35, tWt: 0.69, tabs: 133623, mags: 2, pvpp: 5 },
  { mode: 'regrind', opt: 'a', aPot: 55.5, pwd: 8000, tMg: 60, tWt: 1.15 },
];

const runList: RunMeta[] = [
  { name: 'PB21RW35D', tag: 'Regrind', tagClass: 'tag-rg', meta: '35 mg · 14,500 g' },
  { name: 'RR35 PB3', tag: 'Fresh', tagClass: 'tag-fr', meta: '35 mg · 133,623 tabs' },
  { name: 'RG-60 Test', tag: 'Regrind', tagClass: 'tag-rg', meta: '60 mg · 8,000 g' },
];

export default function FormulateApp() {
  const [mode, setMode] = useState<Mode>('fresh');
  const [activeTab, setActiveTab] = useState<TabKey>('output');
  const [loadedRun, setLoadedRun] = useState<number | null>(null);

  const [fName, setFName] = useState('');
  const [fPot, setFPot] = useState('');
  const [fTmg, setFTmg] = useState('');
  const [fTwt, setFTwt] = useState('');
  const [fTabs, setFTabs] = useState('');
  const [fMags, setFMags] = useState('2');
  const [fPvpp, setFPvpp] = useState('5');

  const [opt, setOpt] = useState<RegrindOption>('a');
  const [aPot, setAPot] = useState('');
  const [bMg, setBMg] = useState('');
  const [bWt, setBWt] = useState('0.270');
  const [rgPwd, setRgPwd] = useState('');
  const [rgTmg, setRgTmg] = useState('');
  const [rgTwt, setRgTwt] = useState('');

  const baseIngredients = useMemo(() => defaultIngredients(), []);
  const activeIngredient = baseIngredients.find((i) => i.role === 'active')!;
  const fillerIngredient = baseIngredients.find((i) => i.calculatedByDifference)!;
  const alreadyPresentNames = baseIngredients
    .filter((i) => i.role === 'disintegrant' || i.role === 'lubricant')
    .map((i) => i.name);

  const freshIngredients = useMemo<IngredientLine[]>(
    () =>
      baseIngredients.map((i) => {
        if (i.role === 'active') {
          return { ...i, name: fName.trim() || i.name, percentOfBlend: numOrZero(fPot) };
        }
        if (i.id === 'magstearate') return { ...i, percentOfBlend: numOrZero(fMags) };
        if (i.id === 'pvpp') return { ...i, percentOfBlend: numOrZero(fPvpp) };
        return i;
      }),
    [baseIngredients, fName, fPot, fMags, fPvpp]
  );

  const emdexDisplay = Math.max(
    0,
    100 - numOrZero(fPot) - numOrZero(fMags) - numOrZero(fPvpp)
  ).toFixed(2);

  const freshResult = useMemo(() => {
    try {
      return calculateFreshBatch({
        tabletCount: numOrZero(fTabs),
        targetWeightG: numOrZero(fTwt),
        targetActiveMgPerTablet: numOrZero(fTmg),
        ingredients: freshIngredients,
      });
    } catch {
      return null;
    }
  }, [fTabs, fTwt, fTmg, freshIngredients]);

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
      const activeG = result.ingredientGrams[activeIngredient.id];
      const fillerG = result.ingredientGrams[fillerIngredient.id];
      const pvppIngredient = baseIngredients.find((i) => i.id === 'pvpp')!;
      const magIngredient = baseIngredients.find((i) => i.id === 'magstearate')!;
      const pvppG = result.ingredientGrams[pvppIngredient.id];
      const magG = result.ingredientGrams[magIngredient.id];
      return [
        { label: `${freshIngredients[0].name} active`, value: `${fmt(activeG)} g`, icon: 'plus', key: true },
        { label: fillerIngredient.name, value: `${fmt(fillerG)} g`, icon: 'cube', key: true },
        { label: pvppIngredient.name, value: `${fmt(pvppG)} g`, icon: 'circle-plus', key: false },
        { label: magIngredient.name, value: `${fmt(magG)} g`, icon: 'circle-plus', key: false },
      ];
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
  }, [result, activeIngredient, fillerIngredient, baseIngredients, freshIngredients]);

  const warnRow =
    result && result.mode === 'regrind'
      ? `Do not add fresh ${result.alreadyPresentIngredientNames.join(' or ')} — already present in regrind`
      : null;

  function loadRun(i: number) {
    const p = presets[i];
    setLoadedRun(i);
    if (p.mode === 'regrind') {
      setMode('regrind');
      setOpt(p.opt);
      if (p.opt === 'a') {
        setAPot(String(p.aPot ?? ''));
      } else {
        setBMg(String(p.bMg ?? ''));
        setBWt(String(p.bWt ?? 0.27));
      }
      setRgPwd(String(p.pwd ?? ''));
      setRgTmg(String(p.tMg ?? ''));
      setRgTwt(String(p.tWt ?? ''));
    } else {
      setMode('fresh');
      setFPot(String(p.pot ?? ''));
      setFTmg(String(p.tMg ?? ''));
      setFTwt(String(p.tWt ?? ''));
      setFTabs(String(p.tabs ?? ''));
      setFMags(String(p.mags ?? 2));
      setFPvpp(String(p.pvpp ?? 5));
    }
  }

  function resetForm() {
    setLoadedRun(null);
    setFName('');
    setFPot('');
    setFTmg('');
    setFTwt('');
    setFTabs('');
    setFMags('2');
    setFPvpp('5');
    setAPot('');
    setBMg('');
    setBWt('0.270');
    setRgPwd('');
    setRgTmg('');
    setRgTwt('');
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar mode={mode} onReset={resetForm} />
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
              fMags={fMags}
              setFMags={setFMags}
              fPvpp={fPvpp}
              setFPvpp={setFPvpp}
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
            <RunHistoryPanel runs={runList} loadedRun={loadedRun} onLoadRun={loadRun} />
            <TipsCard />
          </div>
        </div>
      </div>
    </div>
  );
}
