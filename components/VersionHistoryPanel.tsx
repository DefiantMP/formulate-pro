'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CompositionOutcomeChart from './CompositionOutcomeChart';
import { deriveSavedFormulation, savedFormulationStatusLabel, type SavedFormulationRecord } from '@/lib/savedFormulations';

interface VersionHistoryPanelProps {
  /** The formulation currently being viewed — used to fetch its lineage and to highlight the current row. */
  currentId: string;
}

/**
 * The full version chain for one formulation lineage: the composition +
 * outcome chart (see CompositionOutcomeChart) plus a list of every version
 * with its key composition values, status, and notes visible at a glance.
 * Each row links to that version's own /formulations/[id] detail page.
 */
export default function VersionHistoryPanel({ currentId }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<SavedFormulationRecord[] | null>(null);

  useEffect(() => {
    setVersions(null);
    fetch(`/api/saved-formulations/${currentId}/versions`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setVersions);
  }, [currentId]);

  if (versions === null) {
    return (
      <div className="card">
        <div className="empty">
          <i className="ti ti-history" />
          Loading version history…
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-versions" /> Version history
        </div>
      </div>
      <div className="card-body">
        <CompositionOutcomeChart versions={versions} />
        <div className="rh-list-hdr" style={{ gridTemplateColumns: '0.6fr 1fr 2fr 1fr 2fr' }}>
          <div>Version</div>
          <div>Date</div>
          <div>Key composition</div>
          <div>Status</div>
          <div>Notes</div>
        </div>
        {versions.map((v) => {
          const derived = deriveSavedFormulation(v);
          const isCurrent = v.id === currentId;
          return (
            <div className="rh-row" key={v.id}>
              <Link
                href={`/formulations/${v.id}`}
                className="rh-row-summary"
                style={{ gridTemplateColumns: '0.6fr 1fr 2fr 1fr 2fr', fontWeight: isCurrent ? 600 : 400 }}
              >
                <div className="rh-cell-name">
                  v{v.version}
                  {isCurrent && <span className="mode-chip" style={{ marginLeft: 6 }}>viewing</span>}
                </div>
                <div className="rh-cell">{new Date(v.createdAt).toLocaleDateString()}</div>
                <div className="rh-cell">
                  {derived.combinedActivePercent.toFixed(2)}% active · {v.fillerName} {derived.fillerPercent.toFixed(1)}%
                </div>
                <div className="rh-cell">
                  <span className={`status-badge status-${v.status}`}>{savedFormulationStatusLabel(v.status)}</span>
                </div>
                <div className="rh-cell rh-notes-snippet">{v.outcomeNotes || '—'}</div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
