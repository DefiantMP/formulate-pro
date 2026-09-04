'use client';

import { useCallback, useEffect, useState } from 'react';
import LotStatusBadge from './LotStatusBadge';
import { fmt } from '@/lib/format';
import type { LotListItem } from '@/lib/rawMaterials';

export interface RunLotUsageDraft {
  lotId: string;
  amountUsedG: string;
  roleInRun: string;
}

interface Props {
  usages: RunLotUsageDraft[];
  onChange: (usages: RunLotUsageDraft[]) => void;
  disabled?: boolean;
}

const ROLES = ['fresh_filler', 'fresh_active', 'fresh_excipient', 'regrind', 'other'] as const;
const ROLE_LABELS: Record<string, string> = {
  fresh_filler: 'Filler',
  fresh_active: 'Active',
  fresh_excipient: 'Excipient',
  regrind: 'Regrind',
  other: 'Other',
};

/**
 * Attaches received lots to a run, which is what creates the Run-to-Lot
 * traceability link and what both GMP gates fire on.
 *
 * QC status is shown per lot from the server rollup — the whole reason
 * GET /api/lots had to start returning it. A failing or untested lot is NOT
 * hidden or disabled here: with GMP mode off consuming one is legitimate, and
 * with it on the server decides whether to warn or refuse. Hiding it would
 * make the picker quietly disagree with the setting.
 */
export default function RunLotPicker({ usages, onChange, disabled }: Props) {
  const [lots, setLots] = useState<LotListItem[] | null>(null);

  const load = useCallback(() => {
    fetch('/api/lots')
      .then((r) => (r.ok ? r.json() : []))
      .then(setLots)
      .catch(() => setLots([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  function add() {
    const firstUnused = (lots ?? []).find((l) => !usages.some((u) => u.lotId === l.id));
    if (!firstUnused) return;
    onChange([...usages, { lotId: firstUnused.id, amountUsedG: '', roleInRun: 'fresh_filler' }]);
  }
  function update(i: number, patch: Partial<RunLotUsageDraft>) {
    onChange(usages.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  }
  function remove(i: number) {
    onChange(usages.filter((_, idx) => idx !== i));
  }

  const available = lots ?? [];
  const allUsed = available.length > 0 && usages.length >= available.length;

  return (
    <div className="card" style={{ flexShrink: 0 }}>
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-packages" />
          Lots consumed
        </div>
      </div>
      <div className="card-body">
        {available.length === 0 ? (
          <div className="field-hint">
            No received lots yet. Recording which lot went into a batch is optional — receive one
            under Raw materials to link this run to real inventory.
          </div>
        ) : (
          <>
            <div className="field-hint" style={{ marginBottom: 8 }}>
              Optional. Recording a lot links this batch to real inventory and draws the amount
              down from stock when the run saves.
            </div>

            {usages.map((u, i) => {
              const lot = available.find((l) => l.id === u.lotId);
              const over = lot && Number(u.amountUsedG) > lot.quantityRemainingG;
              return (
                <div className="rm-crit-row" key={`${u.lotId}-${i}`}>
                  <div className="rm-crit-row-hdr">
                    <select
                      value={u.lotId}
                      disabled={disabled}
                      onChange={(e) => update(i, { lotId: e.target.value })}
                      style={{ flex: 1 }}
                    >
                      {available.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.lotLabel} — {l.rawMaterial?.name ?? 'material'}
                        </option>
                      ))}
                    </select>
                    {lot?.specStatus && <LotStatusBadge status={lot.specStatus} />}
                    <button
                      type="button"
                      className="lot-icon-btn danger"
                      title="Remove this lot"
                      onClick={() => remove(i)}
                      disabled={disabled}
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                  <div className="lot-field-grid">
                    <div className="field" style={{ margin: 0 }}>
                      <label>Amount used</label>
                      <div className="row">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={u.amountUsedG}
                          disabled={disabled}
                          onChange={(e) => update(i, { amountUsedG: e.target.value })}
                          placeholder="0"
                        />
                        <div className="unit">g</div>
                      </div>
                      {lot && (
                        <div className="field-hint" style={{ color: over ? 'var(--danger-text)' : undefined }}>
                          {over
                            ? `Only ${fmt(lot.quantityRemainingG, 1)} g remains`
                            : `${fmt(lot.quantityRemainingG, 1)} g remaining`}
                        </div>
                      )}
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Used as</label>
                      <select
                        value={u.roleInRun}
                        disabled={disabled}
                        onChange={(e) => update(i, { roleInRun: e.target.value })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className="add-lot-btn"
              onClick={add}
              disabled={disabled || allUsed}
              title={allUsed ? 'Every received lot is already listed' : undefined}
            >
              <i className="ti ti-plus" /> Add a lot
            </button>
          </>
        )}
      </div>
    </div>
  );
}
