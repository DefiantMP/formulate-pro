'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import LabNotesPanel from './LabNotesPanel';

/** The whole lab notebook. Product and batch pages show filtered slices of it. */
export default function LabNotesPage() {
  const [products, setProducts] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { product: string }[]) => setProducts(rows.map((r) => r.product)))
      .catch(() => setProducts([]));
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">Lab notes</div>
          </div>
        </div>
        <div className="rh-page">
          <div className="card" style={{ flexShrink: 0 }}>
            <div className="card-hdr">
              <div className="card-hdr-title">
                <i className="ti ti-notes" />
                Notebook
              </div>
            </div>
            <div className="card-body">
              <LabNotesPanel
                products={products}
                emptyText="No notes yet — record what you tried, what went wrong, and what a client asked for."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
