'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from './Sidebar';
import { fmtDate } from '@/lib/format';
import {
  summarizePriorRuns,
  summarizeProducts,
  type ProductSummary,
  type RunForSummary,
} from '@/lib/productHistory';

/**
 * Every product this shop has actually made, derived from run history.
 *
 * A product exists here because batches of it exist — there is no separate
 * product record to create, rename or let drift out of step with the runs it
 * claims to describe (same reasoning as /api/products).
 */
export default function ProductsPage() {
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [unnamedRuns, setUnnamedRuns] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/runs')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then((rows: RunForSummary[]) => {
        const runs = summarizePriorRuns(rows);
        setProducts(summarizeProducts(runs));
        setUnnamedRuns(runs.filter((r) => !r.product?.trim()).length);
      })
      .catch(() => setError('Could not load run history.'));
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">Products</div>
          </div>
        </div>
        <div className="rh-page">
          <div className="card">
            <div className="card-hdr">
              <div className="card-hdr-title">
                <i className="ti ti-building-factory-2" />
                Products made
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {error ? (
                <div className="empty">
                  <i className="ti ti-alert-triangle" />
                  {error}
                </div>
              ) : products === null ? (
                <div className="empty">
                  <i className="ti ti-building-factory-2" />
                  Loading…
                </div>
              ) : products.length === 0 ? (
                <div className="empty">
                  <i className="ti ti-building-factory-2" />
                  No products yet — name a product when you start a run and it will appear here
                </div>
              ) : (
                <>
                  <div className="prod-list-hdr">
                    <div>Product</div>
                    <div>Runs</div>
                    <div>Last made</div>
                    <div>Lab results</div>
                    <div />
                  </div>
                  {products.map((p) => (
                    <Link
                      key={p.product}
                      href={`/products/${encodeURIComponent(p.product)}`}
                      className="prod-row"
                    >
                      <div>
                        <b>{p.product}</b>
                        <div className="prod-sub">
                          {p.freshCount > 0 && `${p.freshCount} fresh`}
                          {p.freshCount > 0 && p.regrindCount > 0 && ' · '}
                          {p.regrindCount > 0 && `${p.regrindCount} regrind`}
                        </div>
                      </div>
                      <div>{p.runCount}</div>
                      <div>{fmtDate(p.lastRunAt)}</div>
                      <div>
                        {p.coaRecordedCount === 0 ? (
                          <span className="prod-muted">None recorded</span>
                        ) : (
                          <>
                            {p.passedCount > 0 && (
                              <span className="status-badge status-passed">{p.passedCount} passed</span>
                            )}{' '}
                            {p.failedCount > 0 && (
                              <span className="status-badge status-failed">{p.failedCount} failed</span>
                            )}
                          </>
                        )}
                      </div>
                      <i className="ti ti-chevron-right prod-muted" />
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>

          {unnamedRuns > 0 && (
            <div className="rule-note">
              <i className="ti ti-info-circle" />
              <div>
                {unnamedRuns} saved {unnamedRuns === 1 ? 'run has' : 'runs have'} no product name, so
                {unnamedRuns === 1 ? ' it is' : ' they are'} not grouped here. Setting the product
                when starting a run is what files it under one of these.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
