'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from './Sidebar';
import { fmt, fmtDate } from '@/lib/format';
import {
  OUTCOME_LABELS,
  summarizePriorRuns,
  summarizeProduct,
  type PriorRunSummary,
  type ProductSummary,
  type RunForSummary,
  type TypicalFigure,
} from '@/lib/productHistory';

const OUTCOME_CLASS: Record<PriorRunSummary['outcome'], string> = {
  passed: 'passed',
  failed: 'failed',
  not_recorded: 'untested',
};

/**
 * One figure across this product's runs.
 *
 * A settled figure reads as a single number; a varying one reads as its range
 * and says how many runs it came from. Never a mean — see summarizeFigure:
 * averaging 60mg and 14mg batches produces a dose nobody has ever pressed.
 */
function Figure({ figure, unit, decimals = 2 }: { figure: TypicalFigure | null; unit?: string; decimals?: number }) {
  if (!figure) return <span className="prod-muted">—</span>;
  const u = unit ? ` ${unit}` : '';
  if (!figure.varies) {
    return (
      <>
        {fmt(figure.median, decimals)}
        {u}
      </>
    );
  }
  return (
    <span className="prod-varies" title={`Varies across ${figure.count} runs`}>
      {fmt(figure.min, decimals)}–{fmt(figure.max, decimals)}
      {u} <i className="ti ti-alert-triangle" />
    </span>
  );
}

export default function ProductDetailPage({ product }: { product: string }) {
  const [summary, setSummary] = useState<ProductSummary | null | undefined>(undefined);
  const [runs, setRuns] = useState<PriorRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs?product=${encodeURIComponent(product)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((rows: RunForSummary[]) => {
        const summarised = summarizePriorRuns(rows);
        setRuns(summarised);
        setSummary(summarizeProduct(product, summarised));
      })
      .catch(() => setError('Could not load this product’s runs.'));
  }, [product]);

  const anyVaries =
    !!summary &&
    [
      summary.tabletWeightG,
      ...summary.actives.flatMap((a) => [a.mgPerTablet, a.potencyPercent]),
      ...summary.excipients.map((e) => e.percentOfBlend),
    ].some((f) => f?.varies);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <Link href="/products" className="prod-back">
              <i className="ti ti-arrow-left" /> Products
            </Link>
            <div className="topbar-title">{product}</div>
          </div>
        </div>
        <div className="rh-page">
          {error ? (
            <div className="empty">
              <i className="ti ti-alert-triangle" />
              {error}
            </div>
          ) : summary === undefined ? (
            <div className="empty">
              <i className="ti ti-building-factory-2" />
              Loading…
            </div>
          ) : !summary ? (
            <div className="empty">
              <i className="ti ti-building-factory-2" />
              No runs recorded for {product}
            </div>
          ) : (
            <>
              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-body">
                  <div className="print-stats prod-stats">
                    <div>
                      <span>Runs</span>
                      <strong>{summary.runCount}</strong>
                    </div>
                    <div>
                      <span>Fresh / regrind</span>
                      <strong>
                        {summary.freshCount} / {summary.regrindCount}
                      </strong>
                    </div>
                    <div>
                      <span>First made</span>
                      <strong>{fmtDate(summary.firstRunAt)}</strong>
                    </div>
                    <div>
                      <span>Last made</span>
                      <strong>{fmtDate(summary.lastRunAt)}</strong>
                    </div>
                    <div>
                      <span>Lab results recorded</span>
                      <strong>
                        {summary.coaRecordedCount} of {summary.runCount}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-hdr">
                  <div className="card-hdr-title">
                    <i className="ti ti-flask" />
                    Typical recipe
                  </div>
                </div>
                <div className="card-body">
                  {summary.freshCount === 0 ? (
                    <div className="empty">
                      <i className="ti ti-flask" />
                      Only regrind runs so far — a regrind blend is mostly reworked material, so
                      there is no fresh-batch recipe to summarise
                    </div>
                  ) : (
                    <>
                      <div className="field-hint" style={{ marginBottom: 10 }}>
                        What {summary.freshCount === 1 ? 'the one fresh run' : `${summary.freshCount} fresh runs`} of{' '}
                        {product} actually used — the middle value of each figure, not an average.
                        Regrind runs are left out. This is a record of what was done, not a spec.
                      </div>

                      <div className="prod-rec-row prod-rec-hdr">
                        <div>Ingredient</div>
                        <div>Amount</div>
                        <div>In runs</div>
                      </div>
                      {summary.actives.map((a) => (
                        <div className="prod-rec-row" key={`active-${a.label}`}>
                          <div>
                            <b>{a.label}</b>
                            <div className="prod-sub">
                              Active · potency <Figure figure={a.potencyPercent} unit="%" />
                            </div>
                          </div>
                          <div>
                            <Figure figure={a.mgPerTablet} unit="mg/tab" decimals={1} />
                          </div>
                          <div>
                            {a.runCount} of {summary.freshCount}
                          </div>
                        </div>
                      ))}
                      {summary.excipients.map((e) => (
                        <div className="prod-rec-row" key={`exc-${e.name}`}>
                          <div>
                            <b>{e.name}</b>
                          </div>
                          <div>
                            <Figure figure={e.percentOfBlend} unit="%" />
                          </div>
                          <div>
                            {e.runCount} of {summary.freshCount}
                          </div>
                        </div>
                      ))}
                      <div className="prod-rec-row">
                        <div>
                          <b>Tablet</b>
                          <div className="prod-sub">
                            Filler: {summary.fillers.length === 0 ? '—' : summary.fillers.map((f) => f.name).join(', ')}
                          </div>
                        </div>
                        <div>
                          <Figure figure={summary.tabletWeightG} unit="g" decimals={3} />
                        </div>
                        <div>
                          {summary.tabletCount && (
                            <>
                              <Figure figure={summary.tabletCount} decimals={0} /> tablets
                            </>
                          )}
                        </div>
                      </div>

                      {anyVaries && (
                        <div className="warn-row" style={{ marginTop: 10 }}>
                          <i className="ti ti-alert-triangle" />
                          <div>
                            Figures marked with a range differ by more than 10% between runs, so
                            there is no single typical value — check the runs below before reusing
                            them.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-hdr">
                  <div className="card-hdr-title">
                    <i className="ti ti-history" />
                    Batches
                  </div>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  <div className="prod-list-hdr prod-run-row">
                    <div>Run</div>
                    <div>Mode</div>
                    <div>Tablets</div>
                    <div>Lab result</div>
                    <div />
                  </div>
                  {runs.map((run) => (
                    <div className="prod-run-row" key={run.runId}>
                      <div>
                        <b>{run.label}</b>
                        <div className="prod-sub">{fmtDate(run.createdAt)}</div>
                      </div>
                      <div>{run.mode === 'fresh' ? 'Fresh' : 'Regrind'}</div>
                      <div>{run.tabletCount ? run.tabletCount.toLocaleString() : '—'}</div>
                      <div>
                        <span className={`status-badge status-${OUTCOME_CLASS[run.outcome]}`}>
                          {OUTCOME_LABELS[run.outcome]}
                        </span>
                        {run.actualMgPerTablet !== null && (
                          <div className="prod-sub">{fmt(run.actualMgPerTablet, 2)} mg/tab measured</div>
                        )}
                      </div>
                      <div />
                    </div>
                  ))}
                </div>
              </div>

              <div className="field-hint">
                Lab results are recorded on the <Link href="/run-history">Run history</Link> page.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
