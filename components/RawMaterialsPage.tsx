'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from './Sidebar';
import {
  RAW_MATERIAL_CATEGORIES,
  RAW_MATERIAL_CATEGORY_LABELS,
  type RawMaterialCategory,
  type RawMaterialListItem,
} from '@/lib/rawMaterials';
import { fmtDate } from '@/lib/format';

export default function RawMaterialsPage() {
  const [materials, setMaterials] = useState<RawMaterialListItem[] | null>(null);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<RawMaterialCategory>('active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (query.trim()) params.set('q', query.trim());
    const qs = params.toString();
    fetch(`/api/raw-materials${qs ? `?${qs}` : ''}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setMaterials);
  }, [category, query]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/raw-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, category: newCategory }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to create this raw material.');
        return;
      }
      setNewName('');
      setNewCategory('active');
      setShowForm(false);
      load();
    } catch {
      setError('Failed to create this raw material.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">Raw materials</div>
          </div>
          <div className="topbar-right">
            <button type="button" className="btn btn-p" onClick={() => setShowForm((v) => !v)}>
              <i className="ti ti-plus" /> New material
            </button>
          </div>
        </div>
        <div className="rh-page">
          {showForm && (
            /* flexShrink: 0 — see RunHistoryPanel.tsx: .rh-page stacks cards in
               a flex column and needs each held to its natural content height. */
            <div className="card card-body" style={{ flexShrink: 0 }}>
              <div className="sub-lbl">New raw material</div>
              <form onSubmit={create}>
                <div className="rm-form-grid-2">
                  <div className="field">
                    <label htmlFor="rm-new-name">Name</label>
                    <input
                      id="rm-new-name"
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Magnesium stearate"
                      autoFocus
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="rm-new-category">Category</label>
                    <select
                      id="rm-new-category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as RawMaterialCategory)}
                    >
                      {RAW_MATERIAL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {RAW_MATERIAL_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field-hint">
                  A material is a <i>kind</i> of substance. Individual physical receipts are recorded
                  as lots against it, and its QC spec is set up on its detail page.
                </div>
                {error && <div className="rm-inline-err">{error}</div>}
                <div className="row" style={{ marginTop: 10 }}>
                  <button type="submit" className="btn btn-p" disabled={saving || !newName.trim()}>
                    <i className="ti ti-check" /> {saving ? 'Saving…' : 'Create material'}
                  </button>
                  <button type="button" className="btn" onClick={() => setShowForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="card" style={{ flexShrink: 0 }}>
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <div className="rm-filters">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="rm-search">Search</label>
                  <input
                    id="rm-search"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Material name…"
                  />
                </div>
                <div className="field" style={{ width: 180 }}>
                  <label htmlFor="rm-category-filter">Category</label>
                  <select
                    id="rm-category-filter"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {RAW_MATERIAL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {RAW_MATERIAL_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {materials === null ? (
              <div className="empty">
                <i className="ti ti-package" />
                Loading…
              </div>
            ) : materials.length === 0 ? (
              <div className="empty">
                <i className="ti ti-package" />
                {query.trim() || category
                  ? 'No materials match those filters'
                  : 'No raw materials yet — add one with “New material” above'}
              </div>
            ) : (
              <>
                <div className="rm-list-hdr">
                  <div>Material</div>
                  <div>Category</div>
                  <div>Spec</div>
                  <div>Lots</div>
                  <div />
                </div>
                {materials.map((m) => (
                  <div className="rh-row" key={m.id}>
                    <Link href={`/raw-materials/${m.id}`} className="rm-row-summary">
                      <div className="rh-cell-name">{m.name}</div>
                      <div className="rh-cell">
                        {RAW_MATERIAL_CATEGORY_LABELS[m.category as RawMaterialCategory] ??
                          m.category}
                      </div>
                      <div className="rh-cell">
                        {m.spec ? (
                          m.spec.name
                        ) : (
                          <span style={{ color: 'var(--warning-text)' }}>No spec</span>
                        )}
                      </div>
                      <div className="rh-cell">{m._count.lots}</div>
                      <i className="ti ti-chevron-right rh-chevron" />
                    </Link>
                  </div>
                ))}
              </>
            )}
          </div>

          {materials !== null && materials.length > 0 && (
            <div className="field-hint" style={{ flexShrink: 0, paddingLeft: 4 }}>
              Showing {materials.length} material{materials.length === 1 ? '' : 's'}
              {materials.length > 0 && ` · newest added ${fmtDate(
                materials.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
              )}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
