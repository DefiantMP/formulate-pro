'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { IngredientLine } from '@/lib/calc-engine/types';
import type { Mode, RegrindLotState, RegrindLotPresetRecord } from './FormulateApp';
import RegrindLotCard from './RegrindLotCard';

type StrSetter = Dispatch<SetStateAction<string>>;

interface InputsPanelProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;

  fName: string;
  setFName: StrSetter;
  fPot: string;
  setFPot: StrSetter;
  fTmg: string;
  setFTmg: StrSetter;
  fTwt: string;
  setFTwt: StrSetter;
  fTabs: string;
  setFTabs: StrSetter;
  /** Every non-active, non-filler ingredient in the active formulation — one % field is rendered per entry. */
  excipients: IngredientLine[];
  excipientPercents: Record<string, string>;
  setExcipientPercent: (id: string, value: string) => void;
  fillerName: string;
  emdexDisplay: string;

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
}

export default function InputsPanel(props: InputsPanelProps) {
  const { mode, onModeChange } = props;

  return (
    <div className="card">
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-pill" /> Inputs
        </div>
      </div>
      <div className="card-body">
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
            <div className="field">
              <label>Active ingredient</label>
              <input
                type="text"
                placeholder="e.g. API"
                value={props.fName}
                onChange={(e) => props.setFName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Raw material potency</label>
              <div className="row">
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.001"
                  value={props.fPot}
                  onChange={(e) => props.setFPot(e.target.value)}
                />
                <div className="unit">%</div>
              </div>
            </div>
            <div className="hr" />
            <div className="field">
              <label>Target mg / tablet</label>
              <div className="row">
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.1"
                  value={props.fTmg}
                  onChange={(e) => props.setFTmg(e.target.value)}
                />
                <div className="unit">mg</div>
              </div>
            </div>
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
              <label>% {props.fillerName} (auto)</label>
              <div className="row">
                <input type="number" readOnly value={props.emdexDisplay} />
                <div className="unit">%</div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="sub-lbl">Regrind lots</div>

            {props.lots.map((lot) => (
              <RegrindLotCard
                key={lot.id}
                lot={lot}
                canRemove={props.lots.length > 1}
                presets={props.presets}
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
