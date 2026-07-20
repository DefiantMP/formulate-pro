'use client';

import type { RegrindLotState, RegrindLotPresetRecord } from './FormulateApp';

interface RegrindLotCardProps {
  lot: RegrindLotState;
  canRemove: boolean;
  presets: RegrindLotPresetRecord[];
  /** True when the whole regrind run is in "solve for target tablet count" mode. */
  solveMode: boolean;
  /** This lot's computed weight, once solved — only meaningful when lot.isSolving is true. */
  solvedWeightG: number | null;
  onChange: (id: string, patch: Partial<RegrindLotState>) => void;
  onRemove: (id: string) => void;
  onLoadPreset: (id: string, presetId: string) => void;
  onSaveAsPreset: (id: string) => void;
  onDeletePreset: (presetId: string) => void;
}

export default function RegrindLotCard({
  lot,
  canRemove,
  presets,
  solveMode,
  solvedWeightG,
  onChange,
  onRemove,
  onLoadPreset,
  onSaveAsPreset,
  onDeletePreset,
}: RegrindLotCardProps) {
  return (
    <div className="lot-card">
      <div className="lot-card-hdr">
        <input
          className="lot-name-input"
          type="text"
          value={lot.label}
          onChange={(e) => onChange(lot.id, { label: e.target.value })}
        />
        <div className="lot-card-actions">
          {lot.isStart && <span className="lot-badge">Starts</span>}
          <button
            type="button"
            className="lot-icon-btn"
            title="Save this lot's potency + excipient makeup as a preset"
            onClick={() => onSaveAsPreset(lot.id)}
          >
            <i className="ti ti-device-floppy" />
          </button>
          {canRemove && (
            <button
              type="button"
              className="lot-icon-btn danger"
              title="Remove this lot"
              onClick={() => onRemove(lot.id)}
            >
              <i className="ti ti-trash" />
            </button>
          )}
        </div>
      </div>

      {presets.length > 0 && (
        <div className="lot-preset-list">
          {presets.map((p) => (
            <div className="lot-preset-row" key={p.id}>
              <button
                type="button"
                className="lot-preset-name-btn"
                title={`Load preset "${p.name}" into this lot`}
                onClick={() => onLoadPreset(lot.id, p.id)}
              >
                {p.name}
              </button>
              <button
                type="button"
                className="lot-icon-btn danger"
                title={`Delete preset "${p.name}"`}
                onClick={() => {
                  if (window.confirm(`Delete the saved preset "${p.name}"? This cannot be undone.`)) {
                    onDeletePreset(p.id);
                  }
                }}
              >
                <i className="ti ti-trash" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`opt-box${lot.opt === 'a' ? ' active' : ''}`}
        onClick={() => onChange(lot.id, { opt: 'a' })}
      >
        <div className="opt-header">
          <div className={`opt-radio${lot.opt === 'a' ? ' active' : ''}`} />
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
                placeholder="0.00"
                step="0.001"
                value={lot.aPot}
                onChange={(e) => onChange(lot.id, { aPot: e.target.value })}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="unit">%</div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`opt-box${lot.opt === 'b' ? ' active' : ''}`}
        onClick={() => onChange(lot.id, { opt: 'b' })}
      >
        <div className="opt-header">
          <div className={`opt-radio${lot.opt === 'b' ? ' active' : ''}`} />
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
                placeholder="0.00"
                step="0.01"
                value={lot.bMg}
                onChange={(e) => onChange(lot.id, { bMg: e.target.value })}
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
                placeholder="0.00"
                step="0.001"
                value={lot.bWt}
                onChange={(e) => onChange(lot.id, { bWt: e.target.value })}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="unit">g</div>
            </div>
          </div>
        </div>
      </div>

      {solveMode && (
        <label className="lot-check-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={lot.isSolving}
            onChange={(e) => onChange(lot.id, { isSolving: e.target.checked })}
          />
          Solve for amount needed
        </label>
      )}

      {lot.isSolving ? (
        <div className="field" style={{ marginTop: 8 }}>
          <label>Solved weight (calculated)</label>
          <div className="row">
            <input type="number" readOnly value={solvedWeightG != null ? solvedWeightG.toFixed(1) : ''} placeholder="—" />
            <div className="unit">g</div>
          </div>
        </div>
      ) : (
        <div className="field" style={{ marginTop: 8 }}>
          <label>This lot&apos;s powder weight</label>
          <div className="row">
            <input
              type="number"
              placeholder="0.00"
              step="1"
              value={lot.weightG}
              onChange={(e) => onChange(lot.id, { weightG: e.target.value })}
            />
            <div className="unit">g</div>
          </div>
        </div>
      )}

      <div className="field" style={{ marginTop: 8 }}>
        <label>Filler type</label>
        <input
          type="text"
          list={`filler-type-options-${lot.id}`}
          placeholder="e.g. EasyTab, Emdex"
          value={lot.fillerType}
          onChange={(e) => onChange(lot.id, { fillerType: e.target.value })}
        />
        <datalist id={`filler-type-options-${lot.id}`}>
          <option value="EasyTab" />
          <option value="Emdex" />
          <option value="Other" />
        </datalist>
      </div>

      <div className="lot-field-grid">
        <div className="field" style={{ margin: 0 }}>
          <label>Disintegrant %</label>
          <input
            type="number"
            placeholder="0.00"
            step="0.1"
            value={lot.disintegrantPercent}
            onChange={(e) => onChange(lot.id, { disintegrantPercent: e.target.value })}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Lubricant %</label>
          <input
            type="number"
            placeholder="0.00"
            step="0.1"
            value={lot.lubricantPercent}
            onChange={(e) => onChange(lot.id, { lubricantPercent: e.target.value })}
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 8, opacity: solveMode ? 1 : 0.55 }}>
        <label>Available stock (optional)</label>
        <div
          className="field-hint"
          title="Optional — only relevant when using Solve for target tablet count. Warns if the calculated amount needed exceeds what you have on hand."
        >
          Optional — only relevant when using Solve for target tablet count. Warns if the calculated amount needed
          exceeds what you have on hand.
        </div>
        <div className="row">
          <input
            type="number"
            placeholder="0.00"
            step="1"
            value={lot.availableStockG}
            onChange={(e) => onChange(lot.id, { availableStockG: e.target.value })}
          />
          <div className="unit">g</div>
        </div>
      </div>

      <label className="lot-check-row">
        <input
          type="checkbox"
          checked={lot.isStart}
          onChange={(e) => onChange(lot.id, { isStart: e.target.checked })}
        />
        Press starts / low-confidence potency
      </label>
      {lot.isStart && (
        <input
          className="lot-note-input"
          type="text"
          placeholder="Optional note (e.g. press starts, weight estimated)"
          value={lot.note}
          onChange={(e) => onChange(lot.id, { note: e.target.value })}
        />
      )}
    </div>
  );
}
