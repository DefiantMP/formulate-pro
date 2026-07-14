'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { IngredientLine } from '@/lib/calc-engine/types';
import type { Mode, RegrindOption } from './FormulateApp';

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

  opt: RegrindOption;
  onOptChange: (opt: RegrindOption) => void;
  aPot: string;
  setAPot: StrSetter;
  bMg: string;
  setBMg: StrSetter;
  bWt: string;
  setBWt: StrSetter;
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
            <div className="sub-lbl">Old tablet potency — pick one</div>

            <div
              className={`opt-box${props.opt === 'a' ? ' active' : ''}`}
              onClick={() => props.onOptChange('a')}
            >
              <div className="opt-header">
                <div className={`opt-radio${props.opt === 'a' ? ' active' : ''}`} />
                <div>
                  <div className="opt-title">Option A — bulk potency %</div>
                  <div className="opt-desc">Raw material COA gives a % value</div>
                </div>
              </div>
              <div className="opt-fields">
                <div className="field" style={{ margin: 0 }}>
                  <label>Potency of old batch</label>
                  <div className="row">
                    <input
                      type="number"
                      placeholder="55.5"
                      step="0.001"
                      value={props.aPot}
                      onChange={(e) => props.setAPot(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="unit">%</div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`opt-box${props.opt === 'b' ? ' active' : ''}`}
              onClick={() => props.onOptChange('b')}
            >
              <div className="opt-header">
                <div className={`opt-radio${props.opt === 'b' ? ' active' : ''}`} />
                <div>
                  <div className="opt-title">Option B — mg per tablet</div>
                  <div className="opt-desc">Finished tablet COA gives mg / tablet</div>
                </div>
              </div>
              <div className="opt-fields">
                <div className="field">
                  <label>mg active per old tablet</label>
                  <div className="row">
                    <input
                      type="number"
                      placeholder="20.1"
                      step="0.01"
                      value={props.bMg}
                      onChange={(e) => props.setBMg(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="unit">mg</div>
                  </div>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Old tablet pressed weight</label>
                  <div className="row">
                    <input
                      type="number"
                      placeholder="0.270"
                      step="0.001"
                      value={props.bWt}
                      onChange={(e) => props.setBWt(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="unit">g</div>
                  </div>
                </div>
              </div>
            </div>

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
