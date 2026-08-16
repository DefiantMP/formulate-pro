'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from './Sidebar';
import SpecEditor from './SpecEditor';
import ReceiveLotForm from './ReceiveLotForm';
import {
  RAW_MATERIAL_CATEGORIES,
  RAW_MATERIAL_CATEGORY_LABELS,
  LOT_SOURCE_TYPE_LABELS,
  type LotListItem,
  type LotSourceType,
  type RawMaterialCategory,
  type RawMaterialDetail,
} from '@/lib/rawMaterials';
import { fmt, fmtDate } from '@/lib/format';

interface RawMaterialDetailPageProps {
  id: string;
}

export default function RawMaterialDetailPage({ id }: RawMaterialDetailPageProps) {
  const [material, setMaterial] = useState<RawMaterialDetail | null | undefined>(undefined);
  const [lots, setLots] = useState<LotListItem[] | null>(null);
  const [showReceive, setShowReceive] = useState(false);

  const [editingHeader, setEditingHeader] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<RawMaterialCategory>('other');
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);

  const loadMaterial = useCallback(() => {
    fetch(`/api/raw-materials/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setMaterial);
  }, [id]);

  const loadLots = useCallback(() => {
    fetch(`/api/lots?rawMaterialId=${encodeURIComponent(id)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setLots);
  }, [id]);

  useEffect(() => {
    loadMaterial();
    loadLots();
  }, [loadMaterial, loadLots]);

  function beginEditHeader() {
    if (!material) return;
    setName(material.name);
    setCategory(material.category as RawMaterialCategory);
    setHeaderError(null);
    setEditingHeader(true);
  }

  async function saveHeader() {
    setSavingHeader(true);
    setHeaderError(null);
    try {
      const res = await fetch(`/api/raw-materials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setHeaderError(data?.error || 'Failed to save this material.');
        return;
      }
      setEditingHeader(false);
      loadMaterial();
    } catch {
      setHeaderError('Failed to save this material.');
    } finally {
      setSavingHeader(false);
    }
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <Link href="/raw-materials" className="btn">
              <i className="ti ti-arrow-left" /> Raw materials
            </Link>
            <div className="topbar-title">{material ? material.name : 'Raw material'}</div>
          </div>
          {material && (
            <div className="topbar-right">
              <button type="button" className="btn btn-p" onClick={() => setShowReceive((v) => !v)}>
                <i className="ti ti-package-import" /> Receive lot
              </button>
            </div>
          )}
        </div>

        <div className="rh-page">
          {material === undefined ? (
            <div className="card" style={{ flexShrink: 0 }}>
              <div className="empty">
                <i className="ti ti-package" />
                Loading…
              </div>
            </div>
          ) : material === null ? (
            <div className="card" style={{ flexShrink: 0 }}>
              <div className="empty">
                <i className="ti ti-alert-triangle" />
                Raw material not found
              </div>
            </div>
          ) : (
            <>
              {/* flexShrink: 0 — see RunHistoryPanel.tsx: .rh-page stacks cards
                  in a flex column and needs each held to its natural content
                  height, or they get silently clipped. */}
              <div className="card card-body" style={{ flexShrink: 0 }}>
                {editingHeader ? (
                  <>
                    <div className="sub-lbl">Edit material</div>
                    <div className="rm-form-grid-2">
                      <div className="field">
                        <label htmlFor="rm-name">Name</label>
                        <input
                          id="rm-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="rm-category">Category</label>
                        <select
                          id="rm-category"
                          value={category}
                          onChange={(e) => setCategory(e.target.value as RawMaterialCategory)}
                        >
                          {RAW_MATERIAL_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {RAW_MATERIAL_CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {headerError && <div className="rm-inline-err">{headerError}</div>}
                    <div className="row" style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-p"
                        onClick={saveHeader}
                        disabled={savingHeader || !name.trim()}
                      >
                        <i className="ti ti-check" /> {savingHeader ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setEditingHeader(false)}
                        disabled={savingHeader}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div className="add-sub">
                        {RAW_MATERIAL_CATEGORY_LABELS[material.category as RawMaterialCategory] ??
                          material.category}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 600 }}>{material.name}</div>
                      <div className="field-hint" style={{ marginTop: 4 }}>
                        Added {fmtDate(material.createdAt)} ·{' '}
                        {lots === null ? '…' : `${lots.length} lot${lots.length === 1 ? '' : 's'}`}{' '}
                        received
                      </div>
                    </div>
                    <button type="button" className="btn" onClick={beginEditHeader}>
                      <i className="ti ti-edit" /> Edit
                    </button>
                  </div>
                )}
              </div>

              {showReceive && (
                <ReceiveLotForm
                  rawMaterialId={material.id}
                  materialName={material.name}
                  onReceived={() => {
                    setShowReceive(false);
                    loadLots();
                  }}
                  onCancel={() => setShowReceive(false)}
                />
              )}

              <SpecEditor material={material} onSaved={loadMaterial} />

              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-hdr">
                  <div className="card-hdr-title">
                    <i className="ti ti-packages" />
                    Lots received
                  </div>
                </div>
                {lots === null ? (
                  <div className="empty">
                    <i className="ti ti-packages" />
                    Loading…
                  </div>
                ) : lots.length === 0 ? (
                  <div className="empty">
                    <i className="ti ti-packages" />
                    No lots received yet — record one with “Receive lot” above
                  </div>
                ) : (
                  <>
                    <div className="rm-lot-hdr">
                      <div>Lot number</div>
                      <div>Received</div>
                      <div>Remaining</div>
                      <div>Source</div>
                      <div />
                    </div>
                    {lots.map((lot) => (
                      <div className="rh-row" key={lot.id}>
                        <Link href={`/lots/${lot.id}`} className="rm-lot-summary">
                          <div className="rh-cell-name">{lot.lotLabel}</div>
                          <div className="rh-cell">{fmtDate(lot.receivedDate)}</div>
                          <div className="rh-cell">
                            {fmt(lot.quantityRemainingG, 1)} / {fmt(lot.quantityReceivedG, 1)} g
                          </div>
                          <div className="rh-cell">
                            {LOT_SOURCE_TYPE_LABELS[lot.sourceType as LotSourceType] ??
                              lot.sourceType}
                          </div>
                          <i className="ti ti-chevron-right rh-chevron" />
                        </Link>
                      </div>
                    ))}
                    <div className="card-body" style={{ paddingTop: 0 }}>
                      <div className="rule-note" style={{ marginBottom: 0, marginTop: 12 }}>
                        <i className="ti ti-info-circle" />
                        <div>
                          QC status isn’t shown in this list on purpose. A lot’s verdict is computed
                          from its material’s current criteria plus its whole test history, which
                          this list doesn’t load — showing anything here would mean deriving a
                          status some other way. Open a lot to see its verdict.
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
