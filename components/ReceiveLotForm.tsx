'use client';

import { useState } from 'react';
import {
  LOT_SOURCE_TYPES,
  LOT_SOURCE_TYPE_LABELS,
  type LotSourceType,
} from '@/lib/rawMaterials';
import { dateInputToIso, isoToDateInput } from '@/lib/format';

interface ReceiveLotFormProps {
  rawMaterialId: string;
  materialName: string;
  onReceived: () => void;
  onCancel: () => void;
}

export default function ReceiveLotForm({
  rawMaterialId,
  materialName,
  onReceived,
  onCancel,
}: ReceiveLotFormProps) {
  const [lotLabel, setLotLabel] = useState('');
  const [receivedDate, setReceivedDate] = useState(isoToDateInput(new Date()));
  const [quantityReceivedG, setQuantityReceivedG] = useState('');
  const [sourceType, setSourceType] = useState<LotSourceType>('purchased');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(quantityReceivedG);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantity received must be a positive number of grams.');
      return;
    }
    if (!receivedDate) {
      setError('A received date is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMaterialId,
          lotLabel,
          receivedDate: dateInputToIso(receivedDate),
          quantityReceivedG: quantity,
          sourceType,
          supplier: supplier.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to receive this lot.');
        return;
      }
      onReceived();
    } catch {
      setError('Failed to receive this lot.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card card-body" style={{ flexShrink: 0 }}>
      <div className="sub-lbl">Receive a lot of {materialName}</div>
      <form onSubmit={submit}>
        <div className="rm-form-grid">
          <div className="field">
            <label htmlFor="lot-label">Lot number</label>
            <input
              id="lot-label"
              type="text"
              value={lotLabel}
              onChange={(e) => setLotLabel(e.target.value)}
              placeholder="e.g. MS-2026-0431"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="lot-received">Received date</label>
            <input
              id="lot-received"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lot-qty">Quantity received</label>
            <div className="row">
              <input
                id="lot-qty"
                type="number"
                step="any"
                min="0"
                value={quantityReceivedG}
                onChange={(e) => setQuantityReceivedG(e.target.value)}
                placeholder="0"
              />
              <div className="unit">g</div>
            </div>
          </div>
        </div>

        <div className="rm-form-grid-2">
          <div className="field">
            <label htmlFor="lot-source">Source type</label>
            <select
              id="lot-source"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as LotSourceType)}
            >
              {LOT_SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {LOT_SOURCE_TYPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lot-supplier">Supplier</label>
            <input
              id="lot-supplier"
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="optional"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="lot-notes">Notes</label>
          <textarea
            id="lot-notes"
            className="rm-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional — container condition, COA reference, sampling notes…"
          />
        </div>

        <div className="field-hint">
          The quantity remaining starts equal to the quantity received. A lot number can repeat
          across different materials, but not twice for this one.
        </div>

        {error && <div className="rm-inline-err">{error}</div>}

        <div className="row" style={{ marginTop: 10 }}>
          <button type="submit" className="btn btn-p" disabled={saving || !lotLabel.trim()}>
            <i className="ti ti-package-import" /> {saving ? 'Receiving…' : 'Receive lot'}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
