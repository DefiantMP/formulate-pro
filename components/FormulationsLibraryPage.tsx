'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IMPORT_DRAFT_PREFIX, type FormulationImportDraft } from './FormulationBuilderPage';
import Sidebar from './Sidebar';
import { deriveSavedFormulation, type SavedFormulationRecord } from '@/lib/savedFormulations';
import { fmt } from '@/lib/format';

export default function FormulationsLibraryPage() {
  const [formulations, setFormulations] = useState<SavedFormulationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  /**
   * Read a formulation sheet and open the builder pre-filled with it. The
   * reading travels by sessionStorage (it can be large, and must not end up
   * in a URL); nothing is saved until the builder's own Save, after review.
   */
  async function importSheet(file: File | undefined) {
    if (!file) return;
    setReading(file.name);
    setImportError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('purpose', 'formulation');
      const res = await fetch('/api/imports', { method: 'POST', body: form });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.formulation) {
        setImportError(`${file.name}: ${d?.error || 'could not be read'}`);
        return;
      }
      const draft: FormulationImportDraft = {
        attachmentId: d.attachmentId,
        filename: d.filename,
        method: d.method,
        formulation: d.formulation,
      };
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(IMPORT_DRAFT_PREFIX + key, JSON.stringify(draft));
      router.push(`/formulations/new?importDraft=${key}`);
    } catch {
      setImportError(`${file.name}: could not reach the server`);
    } finally {
      setReading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

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
            <button
              type="button"
              className="btn"
              onClick={() => fileInput.current?.click()}
              disabled={!!reading}
              title="A formulation sheet — photo, PDF, Word or text file"
            >
              <i className="ti ti-file-upload" /> {reading ? 'Reading…' : 'Import formulation'}
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.md,.docx,image/jpeg,image/png,application/pdf,text/plain"
              onChange={(e) => importSheet(e.target.files?.[0])}
            />
            <Link href="/formulations/new" className="btn btn-p">
              <i className="ti ti-plus" /> New formulation
            </Link>
          </div>
        </div>
        <div className="rh-page">
          {reading && (
            <div className="rule-note">
              <i className="ti ti-loader-2" />
              <div>Reading {reading}… a formulation sheet can take up to half a minute.</div>
            </div>
          )}
          {importError && <div className="rm-inline-err">{importError}</div>}
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
                        <div className="rh-cell-name">
                          {f.name}
                          {f.importedFrom && <div className="rh-cell-product">Imported</div>}
                        </div>
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
