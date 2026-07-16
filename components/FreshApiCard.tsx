'use client';

import type { FreshApiState, FreshPotencyMethod } from './FormulateApp';

interface FreshApiCardProps {
  api: FreshApiState;
  index: number;
  canRemove: boolean;
  potencyMethod: FreshPotencyMethod;
  onChange: (id: string, patch: Partial<FreshApiState>) => void;
  onRemove: (id: string) => void;
}

export default function FreshApiCard({
  api,
  index,
  canRemove,
  potencyMethod,
  onChange,
  onRemove,
}: FreshApiCardProps) {
  return (
    <div className="lot-card">
      <div className="lot-card-hdr">
        <input
          className="lot-name-input"
          type="text"
          placeholder={`API ${index + 1}`}
          value={api.label}
          onChange={(e) => onChange(api.id, { label: e.target.value })}
        />
        <div className="lot-card-actions">
          {canRemove && (
            <button
              type="button"
              className="lot-icon-btn danger"
              title="Remove this API"
              onClick={() => onRemove(api.id)}
            >
              <i className="ti ti-trash" />
            </button>
          )}
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label>Target mg / tablet</label>
        <div className="row">
          <input
            type="number"
            placeholder="0.00"
            step="0.1"
            value={api.targetMg}
            onChange={(e) => onChange(api.id, { targetMg: e.target.value })}
          />
          <div className="unit">mg</div>
        </div>
      </div>

      {potencyMethod === 'bulkPercent' ? (
        <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
          <label>Raw material potency</label>
          <div className="row">
            <input
              type="number"
              placeholder="0.00"
              step="0.001"
              value={api.potPercent}
              onChange={(e) => onChange(api.id, { potPercent: e.target.value })}
            />
            <div className="unit">%</div>
          </div>
        </div>
      ) : (
        <div className="lot-field-grid" style={{ marginTop: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>mg active per unit</label>
            <input
              type="number"
              placeholder="0.00"
              step="0.01"
              value={api.potMgPerUnit}
              onChange={(e) => onChange(api.id, { potMgPerUnit: e.target.value })}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Unit weight (g)</label>
            <input
              type="number"
              placeholder="0.00"
              step="0.001"
              value={api.potUnitWeightG}
              onChange={(e) => onChange(api.id, { potUnitWeightG: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
