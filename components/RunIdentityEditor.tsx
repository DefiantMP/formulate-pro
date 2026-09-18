'use client';

import { useEffect, useState } from 'react';

/**
 * Rename a saved run, or file it under a product.
 *
 * Exists because the Products page is only as good as the product names on
 * runs, and a name typed wrong at the start of a batch — or not typed at all —
 * previously could not be fixed. Changes only the run's label and product:
 * never its inputs or results, so the batch's recorded numbers are untouched
 * (and the PATCH carries no composition, so it triggers no formulation sync).
 */
export default function RunIdentityEditor({
  runId,
  label,
  product,
  knownProducts,
  onSaved,
}: {
  runId: string;
  label: string;
  product: string | null;
  knownProducts: string[];
  onSaved: (patch: { label: string; product: string | null }) => void;
}) {
  const [name, setName] = useState(label);
  const [prod, setProd] = useState(product ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Follow the row if it is refreshed from elsewhere while this is open.
  useEffect(() => {
    setName(label);
    setProd(product ?? '');
  }, [label, product]);

  const dirty = name.trim() !== label || (prod.trim() || null) !== (product ?? null);
  const listId = `known-products-${runId}`;

  async function save() {
    if (!name.trim()) {
      setError('A run needs a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: name.trim(), product: prod.trim() || null }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error || 'Could not save.');
        return;
      }
      onSaved({ label: d.label, product: d.product ?? null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="rh-detail-hdr">Run details</div>
      <div className="rh-identity">
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`run-name-${runId}`}>Run name</label>
          <input id={`run-name-${runId}`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`run-product-${runId}`}>Product</label>
          <input
            id={`run-product-${runId}`}
            type="text"
            list={listId}
            value={prod}
            placeholder="No product"
            onChange={(e) => setProd(e.target.value)}
          />
          <datalist id={listId}>
            {knownProducts.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <button type="button" className="btn btn-p" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>
      <div className="field-hint" style={{ marginTop: 4 }}>
        Pick an existing product so this batch is grouped with the others on the Products page.
        The batch&apos;s numbers are not changed.
      </div>
      {error && <div className="rm-inline-err">{error}</div>}
    </div>
  );
}
