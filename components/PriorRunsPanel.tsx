'use client';

import { useEffect, useState } from 'react';
import {
  OUTCOME_LABELS,
  summarizePriorRuns,
  type PriorRunSummary,
  type RunForSummary,
} from '@/lib/productHistory';
import { fmt, fmtDate } from '@/lib/format';

interface PriorRunsPanelProps {
  product: string;
  /** Excluded from the list — a run doesn't suggest itself back to you. */
  currentRunId: string | null;
  onApply: (run: PriorRunSummary) => void;
}

const OUTCOME_CLASS: Record<PriorRunSummary['outcome'], string> = {
  passed: 'passed',
  failed: 'failed',
  not_recorded: 'untested',
};

/**
 * What past batches of this product used.
 *
 * Deliberately suggestion-only: nothing here writes into the form until the
 * operator presses Apply on a specific run. No averaging across runs either —
 * a mean of several batches is a set of numbers that no batch actually used,
 * which is the wrong thing to put in front of someone about to weigh
 * material. Each row is one real, traceable run.
 *
 * Outcome is shown rather than acted on: runs whose COA was never recorded
 * are labelled as such instead of being silently treated as good.
 */
export default function PriorRunsPanel({ product, currentRunId, onApply }: PriorRunsPanelProps) {
  const [runs, setRuns] = useState<PriorRunSummary[] | null>(null);

  useEffect(() => {
    if (!product.trim()) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    setRuns(null);
    fetch(`/api/runs?product=${encodeURIComponent(product.trim())}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: RunForSummary[]) => {
        if (!cancelled) setRuns(summarizePriorRuns(rows));
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [product]);

  if (!product.trim()) return null;

  const others = (runs ?? []).filter((r) => r.runId !== currentRunId);

  return (
    <div className="card" style={{ flexShrink: 0 }}>
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-history" />
          Past {product} batches
        </div>
      </div>
      <div className="card-body">
        {runs === null ? (
          <div className="empty">
            <i className="ti ti-history" />
            Loading…
          </div>
        ) : others.length === 0 ? (
          <div className="empty">
            <i className="ti ti-history" />
            No earlier {product} runs yet — this will fill in as you make them
          </div>
        ) : (
          <>
            <div className="rule-note">
              <i className="ti ti-info-circle" />
              <div>
                Reference only — nothing is entered until you apply a run. Each row is one real
                batch, not an average.
              </div>
            </div>
            {others.map((run) => (
              <div className="prior-run" key={run.runId}>
                <div className="prior-run-hdr">
                  <div style={{ minWidth: 0 }}>
                    <div className="prior-run-label">{run.label}</div>
                    <div className="prior-run-date">
                      {fmtDate(run.createdAt)} · {run.mode === 'fresh' ? 'Fresh batch' : 'Regrind'}
                    </div>
                  </div>
                  <span className={`status-badge status-${OUTCOME_CLASS[run.outcome]}`}>
                    {OUTCOME_LABELS[run.outcome]}
                  </span>
                </div>

                <div className="prior-run-figs">
                  {run.tabletWeightG !== null && (
                    <div className="prior-run-fig">
                      <span>Tablet weight</span>
                      <strong>{fmt(run.tabletWeightG, 3)} g</strong>
                    </div>
                  )}
                  {run.tabletCount !== null && (
                    <div className="prior-run-fig">
                      <span>Tablets</span>
                      <strong>{run.tabletCount.toLocaleString()}</strong>
                    </div>
                  )}
                  {run.fillerName && (
                    <div className="prior-run-fig">
                      <span>Filler</span>
                      <strong>{run.fillerName}</strong>
                    </div>
                  )}
                </div>

                {run.actives.length > 0 && (
                  <div className="prior-run-list">
                    {run.actives.map((a, i) => (
                      <div key={`${a.label}-${i}`}>
                        {a.label}: <b>{fmt(a.targetMgPerTablet, 1)} mg</b> @{' '}
                        <b>{a.potencyPercent.toFixed(2)}%</b> potency
                      </div>
                    ))}
                  </div>
                )}
                {run.excipients.length > 0 && (
                  <div className="prior-run-list">
                    {run.excipients.map((e) => (
                      <div key={e.name}>
                        {e.name}: <b>{e.percentOfBlend.toFixed(2)}%</b>
                      </div>
                    ))}
                  </div>
                )}

                {(run.actualMgPerTablet !== null || run.actualTabletWeight !== null) && (
                  <div className="prior-run-coa">
                    COA:{' '}
                    {run.actualMgPerTablet !== null && <>{fmt(run.actualMgPerTablet, 2)} mg/tab</>}
                    {run.actualMgPerTablet !== null && run.actualTabletWeight !== null && ' · '}
                    {run.actualTabletWeight !== null && <>{fmt(run.actualTabletWeight, 3)} g/tab</>}
                  </div>
                )}
                {run.notes && <div className="prior-run-notes">{run.notes}</div>}

                <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => onApply(run)}>
                  <i className="ti ti-arrow-down-to-arc" /> Use these values
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
