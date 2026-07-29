'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from './Sidebar';
import { deriveSavedFormulation, type SavedFormulationRecord } from '@/lib/savedFormulations';
import { fmt } from '@/lib/format';

export default function FormulationsLibraryPage() {
  const [formulations, setFormulations] = useState<SavedFormulationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/saved-formulations')
      .then((res) => (res.ok ? res.json() : []))
      .then(setFormulations)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">Formulations</div>
          </div>
          <div className="topbar-right">
            <Link href="/formulations/new" className="btn btn-p">
              <i className="ti ti-plus" /> New formulation
            </Link>
          </div>
        </div>
        <div className="rh-page">
          {/* flexShrink: 0 — see RunHistoryPanel.tsx: keeps this card at its
              natural content height so .rh-page scrolls once the list grows
              past available space, instead of silently clipping rows. */}
          <div className="card" style={{ flexShrink: 0 }}>
            {loading ? (
              <div className="empty">
                <i className="ti ti-library" />
                Loading…
              </div>
            ) : formulations.length === 0 ? (
              <div className="empty">
                <i className="ti ti-library" />
                No saved formulations yet — start one with &ldquo;New formulation&rdquo; above
              </div>
            ) : (
              <>
                <div className="rh-list-hdr">
                  <div>Formulation</div>
                  <div>Date</div>
                  <div>Tablet weight</div>
                  <div>Target potency</div>
                  <div>Active(s)</div>
                  <div />
                </div>
                {formulations.map((f) => {
                  const derived = deriveSavedFormulation(f);
                  return (
                    <div className="rh-row" key={f.id}>
                      <Link href={`/formulations/${f.id}`} className="rh-row-summary">
                        <div className="rh-cell-name">{f.name}</div>
                        <div className="rh-cell">{new Date(f.createdAt).toLocaleDateString()}</div>
                        <div className="rh-cell">{fmt(f.tabletWeightG, 3)} g</div>
                        <div className="rh-cell">{derived.combinedActivePercent.toFixed(2)}%</div>
                        <div className="rh-cell">{f.actives.map((a) => a.label).join(', ')}</div>
                        <i className="ti ti-chevron-right rh-chevron" />
                      </Link>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
