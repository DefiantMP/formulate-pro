'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Mode } from './FormulateApp';

interface NewRunModalProps {
  mode: Mode;
  onSubmit: (name: string, product: string) => void;
}

/** Covers just the Inputs card (see FormulateApp's col-left wrapper) — Run History and the
 * rest of the app stay usable so an old run can still be loaded instead of starting a new one. */
export default function NewRunModal({ mode, onSubmit }: NewRunModalProps) {
  const [name, setName] = useState('');
  const [product, setProduct] = useState('');
  const [knownProducts, setKnownProducts] = useState<string[]>([]);

  // Products already made, offered as suggestions. Typing a new one is the
  // normal way a product first exists — there is no separate "create product"
  // step, since a product is only ever "something we have run batches of".
  useEffect(() => {
    fetch('/api/products')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: { product: string }[]) => setKnownProducts(rows.map((r) => r.product)))
      .catch(() => setKnownProducts([]));
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed, product.trim());
  }

  return (
    <div className="name-run-overlay">
      <form className="name-run-card" onSubmit={handleSubmit}>
        <div className="name-run-title">Name this run</div>
        <div className="name-run-desc">
          Give this {mode === 'fresh' ? 'fresh batch' : 'regrind'} run a name before entering values —
          every calculation will autosave under it as you go.
        </div>
        <div className="field">
          <label htmlFor="run-product">Product</label>
          <input
            id="run-product"
            type="text"
            list="known-products"
            placeholder="e.g. OGS"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          />
          <datalist id="known-products">
            {knownProducts.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="field-hint">
            Optional. Setting it shows what past batches of this product used.
          </div>
        </div>
        <div className="field">
          <label htmlFor="run-name">Run name</label>
          <input
            id="run-name"
            type="text"
            autoFocus
            placeholder="e.g. RR77-PB9 batch 3"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-p" disabled={!name.trim()}>
          <i className="ti ti-arrow-right" /> Start run
        </button>
      </form>
    </div>
  );
}
