'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { IngredientLine } from '@/lib/calc-engine/types';
import { FRESH_FILLER_TYPES, type FreshFillerType } from '@/lib/calc-engine/types';
import type {
  Mode,
  RegrindLotState,
  RegrindLotPresetRecord,
  FreshApiState,
  FreshPotencyMethod,
} from './FormulateApp';
import RegrindLotCard from './RegrindLotCard';
import FreshApiCard from './FreshApiCard';

type StrSetter = Dispatch<SetStateAction<string>>;

interface InputsPanelProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;

  apis: FreshApiState[];
  onUpdateApi: (id: string, patch: Partial<FreshApiState>) => void;
  onAddApi: () => void;
  onRemoveApi: (id: string) => void;
  potencyMethod: FreshPotencyMethod;
  onPotencyMethodChange: (method: FreshPotencyMethod) => void;
  fTwt: string;
  setFTwt: StrSetter;
  fTabs: string;
  setFTabs: StrSetter;
  /** Every non-active, non-filler ingredient in the active formulation — one % field is rendered per entry. */
  excipients: IngredientLine[];
  excipientPercents: Record<string, string>;
  setExcipientPercent: (id: string, value: string) => void;
  fillerType: FreshFillerType;
  onFillerTypeChange: (type: FreshFillerType) => void;
  fillerDisplay: string;

  lots: RegrindLotState[];
  onUpdateLot: (id: string, patch: Partial<RegrindLotState>) => void;
  onAddLot: () => void;
  onRemoveLot: (id: string) => void;
  presets: RegrindLotPresetRecord[];
  onLoadPreset: (id: string, presetId: string) => void;
  onSaveAsPreset: (id: string) => void;
  onDeletePreset: (presetId: string) => void;
  rgPwd: string;
  setRgPwd: StrSetter;
  rgTmg: string;
  setRgTmg: StrSetter;
  rgTwt: string;
  setRgTwt: StrSetter;
  regrindSolveMode: boolean;
  onRegrindSolveModeChange: (on: boolean) => void;
  rgTargetTablets: string;
  setRgTargetTablets: StrSetter;
  /** The solving lot's computed weight, once solved — null until then. */
  solvedWeightG: number | null;
}

export default function InputsPanel(props: InputsPanelProps) {
  const { mode, onModeChange } = props;

  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-pill" /> Inputs
        </div>
      </div>
      <div className="card-body" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div className="mode-toggle">
          <button
            className={`m-btn${mode === 'fresh' ? ' active' : ''}`}
            onClick={() => onModeChange('fresh')}
          >
            Fresh batch
          </button>
          <button
            className={`m-btn${mode === 'regrind' ? ' active' : ''}`}
            onClick={() => onModeChange('regrind')}
          >
            Regrind
          </button>
        </div>

        {mode === 'fresh' ? (
          <div>
            <div className="sub-lbl">Potency source (applies to all APIs)</div>
            <div
              className={`opt-box${props.potencyMethod === 'bulkPercent' ? ' active' : ''}`}
              onClick={() => props.onPotencyMethodChange('bulkPercent')}
            >
              <div className="opt-header">
                <div className={`opt-radio${props.potencyMethod === 'bulkPercent' ? ' active' : ''}`} />
                <div>
                  <div className="opt-title">Bulk potency %</div>
                  <div className="opt-desc">Raw material COA gives a % purity value</div>
                </div>
              </div>
            </div>
            <div
              className={`opt-box${props.potencyMethod === 'mgPerUnit' ? ' active' : ''}`}
              onClick={() => props.onPotencyMethodChange('mgPerUnit')}
            >
              <div className="opt-header">
                <div className={`opt-radio${props.potencyMethod === 'mgPerUnit' ? ' active' : ''}`} />
                <div>
                  <div className="opt-title">mg per unit</div>
                  <div className="opt-desc">COA gives mg active per gram of raw material</div>
                </div>
              </div>
            </div>

            <div className="sub-lbl" style={{ marginTop: 12 }}>
              APIs
            </div>
            {props.apis.map((api, index) => (
              <FreshApiCard
                key={api.id}
                api={api}
                index={index}
                canRemove={props.apis.length > 1}
                potencyMethod={props.potencyMethod}
                onChange={props.onUpdateApi}
                onRemove={props.onRemoveApi}
              />
            ))}
            <button type="button" className="add-lot-btn" onClick={props.onAddApi}>
              <i className="ti ti-plus" /> Add another API
            </button>

            <div className="hr" />
            <div className="field">
              <label>Target tablet weight</label>
              <div className="row">
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.001"
                  value={props.fTwt}
                  onChange={(e) => props.setFTwt(e.target.value)}
                />
                <div className="unit">g</div>
              </div>
            </div>
            <div className="field">
              <label>Tablets per run</label>
              <div className="row">
                <input
                  type="number"
                  placeholder="0"
                  step="1"
                  value={props.fTabs}
                  onChange={(e) => props.setFTabs(e.target.value)}
                />
                <div className="unit">tabs</div>
              </div>
            </div>
            <div className="hr" />
            <div className="field">
              <label>Filler type</label>
              <select
                value={props.fillerType}
                onChange={(e) => props.onFillerTypeChange(e.target.value as FreshFillerType)}
              >
                {FRESH_FILLER_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {ft}
                  </option>
                ))}
              </select>
            </div>
            <div className="sub-lbl">Excipients</div>
            {props.excipients.map((ing) => (
              <div className="field" key={ing.id}>
                <label>% {ing.name}</label>
                <div className="row">
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.1"
                    value={props.excipientPercents[ing.id] ?? ''}
                    onChange={(e) => props.setExcipientPercent(ing.id, e.target.value)}
                  />
                  <div className="unit">%</div>
                </div>
              </div>
            ))}
            <div className="field">
              <label>% {props.fillerType} (auto)</label>
              <div className="row">
                <input type="number" readOnly value={props.fillerDisplay} />
                <div className="unit">%</div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="lot-check-row" style={{ marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={props.regrindSolveMode}
                onChange={(e) => props.onRegrindSolveModeChange(e.target.checked)}
              />
              Solve for target tablet count
            </label>

            <div className="sub-lbl">Regrind lots</div>

            {props.lots.map((lot) => (
              <RegrindLotCard
                key={lot.id}
                lot={lot}
                canRemove={props.lots.length > 1}
                presets={props.presets}
                solveMode={props.regrindSolveMode}
                solvedWeightG={lot.isSolving ? props.solvedWeightG : null}
                onChange={props.onUpdateLot}
                onRemove={props.onRemoveLot}
                onLoadPreset={props.onLoadPreset}
                onSaveAsPreset={props.onSaveAsPreset}
                onDeletePreset={props.onDeletePreset}
              />
            ))}

            <button type="button" className="add-lot-btn" onClick={props.onAddLot}>
              <i className="ti ti-plus" /> Add another mix
            </button>

            <div className="hr" />
            {props.regrindSolveMode ? (
              <div className="field">
                <label>Target tablet count</label>
                <div className="row">
                  <input
                    type="number"
                    placeholder="100000"
                    step="1"
                    value={props.rgTargetTablets}
                    onChange={(e) => props.setRgTargetTablets(e.target.value)}
                  />
                  <div className="unit">tabs</div>
                </div>
              </div>
            ) : (
              <div className="field">
                <label>Total reground powder weight</label>
                <div className="row">
                  <input
                    type="number"
                    placeholder="14500"
                    step="1"
                    value={props.rgPwd}
                    onChange={(e) => props.setRgPwd(e.target.value)}
                  />
                  <div className="unit">g</div>
                </div>
              </div>
            )}
            <div className="hr" />
            <div className="sub-lbl">Target new tablet</div>
            <div className="field">
              <label>Target mg / tablet</label>
              <div className="row">
                <input
                  type="number"
                  placeholder="35"
                  step="0.1"
                  value={props.rgTmg}
                  onChange={(e) => props.setRgTmg(e.target.value)}
                />
                <div className="unit">mg</div>
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Target tablet weight</label>
              <div className="row">
                <input
                  type="number"
                  placeholder="0.800"
                  step="0.001"
                  value={props.rgTwt}
                  onChange={(e) => props.setRgTwt(e.target.value)}
                />
                <div className="unit">g</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
