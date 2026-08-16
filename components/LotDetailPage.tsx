'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from './Sidebar';
import LogSpecTestForm from './LogSpecTestForm';
import OosInvestigationPanel from './OosInvestigationPanel';
import { criterionLimits } from './SpecEditor';
import {
  isInvalidatingInvestigation,
  resolveLatestTests,
  type LotSpecStatus,
} from '@/lib/lotSpecStatus';
import {
  LOT_SOURCE_TYPE_LABELS,
  RAW_MATERIAL_CATEGORY_LABELS,
  toSpecTestInputs,
  type LotDetailRecord,
  type LotSourceType,
  type LotSpecTestRecord,
  type RawMaterialCategory,
  type SpecCriterionRecord,
} from '@/lib/rawMaterials';
import { fmt, fmtDate } from '@/lib/format';

const STATUS_LABELS: Record<LotSpecStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  pending: 'Pending',
};

const STATUS_ICONS: Record<LotSpecStatus, string> = {
  pass: 'circle-check',
  fail: 'circle-x',
  pending: 'clock-hour-4',
};

/** Never rendered from anything but a rollup verdict — the lot-level one from
 *  the server, or a per-criterion one from criterionStatuses. */
function SpecStatusBadge({ status, large }: { status: LotSpecStatus; large?: boolean }) {
  return (
    <span className={`spec-status ${status}${large ? ' lg' : ''}`}>
      <i className={`ti ti-${STATUS_ICONS[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

const STATUS_EXPLANATIONS: Record<LotSpecStatus, string> = {
  pass: 'Every criterion on this material’s current spec has an affirmative passing result.',
  fail:
    'At least one criterion has a failing result that still stands. A later passing retest does not clear it — only an approved OOS investigation concluding “invalidate original result” can.',
  pending:
    'Not every criterion on the current spec has an affirmative passing result yet. A lot with no spec, an empty spec, untested parameters, or a failure set aside with nothing passing since is pending — never pass.',
};

/** Whether this failing result has been set aside by an approved, invalidating
 *  investigation. Uses the same predicate as the server-side rollup so the
 *  strikethrough here can't disagree with the verdict above it. */
function isSetAside(test: LotSpecTestRecord): boolean {
  return (
    !test.passFail &&
    test.oosInvestigations.some((i) =>
      isInvalidatingInvestigation({
        disposition: i.disposition,
        approvedBy: i.approvedBy,
        approvedAt: i.approvedAt ? new Date(i.approvedAt) : null,
      })
    )
  );
}

function testResultText(test: { resultValue: number | null; resultText: string | null }): string {
  if (test.resultValue !== null) {
    return test.resultText ? `${test.resultValue} — ${test.resultText}` : String(test.resultValue);
  }
  return test.resultText || '—';
}

interface CriterionBlockProps {
  criterion: SpecCriterionRecord;
  /** Absent for a retired criterion: it is no longer part of the spec, so it
   *  has no status — it neither holds the lot at pending nor fails it. */
  status?: LotSpecStatus;
  tests: LotSpecTestRecord[];
  latestResult: string | null;
  lotId: string;
  onChanged: () => void;
}

function CriterionBlock({
  criterion,
  status,
  tests,
  latestResult,
  lotId,
  onChanged,
}: CriterionBlockProps) {
  const retired = criterion.retiredAt !== null;
  return (
    <div className={`crit-block${retired ? ' retired' : ''}`}>
      <div className="crit-hdr">
        <div style={{ minWidth: 0 }}>
          <div className="crit-name">{criterion.parameterName}</div>
          <div className="crit-limits">{criterionLimits(criterion)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {latestResult !== null && (
            <div className="crit-latest">
              Current result: <b>{latestResult}</b>
            </div>
          )}
          {retired ? (
            <span className="rm-retired-tag">Retired</span>
          ) : (
            status && <SpecStatusBadge status={status} />
          )}
        </div>
      </div>
      <div className="crit-tests">
        {tests.length === 0 ? (
          <div className="test-row-meta" style={{ padding: '8px 0' }}>
            Not yet tested.
          </div>
        ) : (
          tests.map((test) => {
            const setAside = isSetAside(test);
            const pfClass = setAside ? 'set-aside' : test.passFail ? 'pass' : 'fail';
            const pfLabel = setAside ? 'Set aside' : test.passFail ? 'Pass' : 'Fail';
            return (
              <div key={test.id}>
                <div className="test-row">
                  <div className="test-row-main">
                    <div>{testResultText(test)}</div>
                    <div className="test-row-meta">
                      {fmtDate(test.testedAt)}
                      {test.testedBy && ` · ${test.testedBy}`}
                      {test.methodUsed && ` · ${test.methodUsed}`}
                    </div>
                    {test.notes && <div className="test-row-meta">{test.notes}</div>}
                  </div>
                  <span className={`test-pf ${pfClass}`}>{pfLabel}</span>
                </div>
                {!test.passFail && (
                  <div style={{ paddingBottom: 10 }}>
                    <OosInvestigationPanel lotId={lotId} test={test} onChanged={onChanged} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface LotDetailPageProps {
  id: string;
}

export default function LotDetailPage({ id }: LotDetailPageProps) {
  const [lot, setLot] = useState<LotDetailRecord | null | undefined>(undefined);

  const load = useCallback(() => {
    fetch(`/api/lots/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setLot);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <Link
              href={lot ? `/raw-materials/${lot.rawMaterial.id}` : '/raw-materials'}
              className="btn"
            >
              <i className="ti ti-arrow-left" />
              {lot ? lot.rawMaterial.name : 'Raw materials'}
            </Link>
            <div className="topbar-title">{lot ? `Lot ${lot.lotLabel}` : 'Lot'}</div>
          </div>
        </div>

        <div className="rh-page">
          {lot === undefined ? (
            <div className="card" style={{ flexShrink: 0 }}>
              <div className="empty">
                <i className="ti ti-package" />
                Loading…
              </div>
            </div>
          ) : lot === null ? (
            <div className="card" style={{ flexShrink: 0 }}>
              <div className="empty">
                <i className="ti ti-alert-triangle" />
                Lot not found
              </div>
            </div>
          ) : (
            <LotDetailBody lot={lot} onChanged={load} />
          )}
        </div>
      </div>
    </div>
  );
}

function LotDetailBody({ lot, onChanged }: { lot: LotDetailRecord; onChanged: () => void }) {
  const activeCriteria = lot.rawMaterial.spec?.criteria ?? [];

  const statusByCriterion = new Map(lot.criterionStatuses.map((s) => [s.criterionId, s.status]));

  const testsByCriterion = new Map<string, LotSpecTestRecord[]>();
  for (const test of lot.specTests) {
    const bucket = testsByCriterion.get(test.specCriterionId);
    if (bucket) bucket.push(test);
    else testsByCriterion.set(test.specCriterionId, [test]);
  }

  // Display only — "what's the current reading for this parameter". The
  // verdicts above come from the rollup, which deliberately disagrees with
  // recency: a newer passing test never buries an older standing failure.
  const latestByCriterion = resolveLatestTests(toSpecTestInputs(lot.specTests));

  // Results recorded against parameters since retired from the spec. They're
  // excluded from status entirely but retained as part of the lot's record.
  const retiredCriteria: SpecCriterionRecord[] = [];
  const seen = new Set(activeCriteria.map((c) => c.id));
  for (const test of lot.specTests) {
    if (seen.has(test.specCriterionId)) continue;
    seen.add(test.specCriterionId);
    retiredCriteria.push(test.specCriterion);
  }

  const failingCriteria = activeCriteria.filter(
    (c) => statusByCriterion.get(c.id) === 'fail'
  );
  const untestedCriteria = activeCriteria.filter(
    (c) => statusByCriterion.get(c.id) === 'pending'
  );

  return (
    <>
      {/* flexShrink: 0 — see RunHistoryPanel.tsx: .rh-page stacks cards in a
          flex column and needs each held to its natural content height. */}
      <div className={`spec-hero ${lot.specStatus}`} style={{ flexShrink: 0 }}>
        <div className="spec-hero-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SpecStatusBadge status={lot.specStatus} large />
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Lot {lot.lotLabel} · {lot.rawMaterial.name}
            </div>
          </div>
          <div className="spec-hero-explain">{STATUS_EXPLANATIONS[lot.specStatus]}</div>
          {failingCriteria.length > 0 && (
            <div className="spec-hero-explain">
              Failing: <b>{failingCriteria.map((c) => c.parameterName).join(', ')}</b>
            </div>
          )}
          {lot.specStatus === 'pending' && untestedCriteria.length > 0 && (
            <div className="spec-hero-explain">
              Awaiting a passing result: <b>{untestedCriteria.map((c) => c.parameterName).join(', ')}</b>
            </div>
          )}
        </div>
      </div>

      <div className="card card-body" style={{ flexShrink: 0 }}>
        <div className="stats">
          <div className="stat">
            <div className="stat-lbl">Received</div>
            <div className="stat-val" style={{ fontSize: 15 }}>{fmtDate(lot.receivedDate)}</div>
            <div className="stat-unit">
              {LOT_SOURCE_TYPE_LABELS[lot.sourceType as LotSourceType] ?? lot.sourceType}
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Quantity remaining</div>
            <div className="stat-val">{fmt(lot.quantityRemainingG, 1)}</div>
            <div className="stat-unit">of {fmt(lot.quantityReceivedG, 1)} g received</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Material</div>
            <div className="stat-val" style={{ fontSize: 15 }}>{lot.rawMaterial.name}</div>
            <div className="stat-unit">
              {RAW_MATERIAL_CATEGORY_LABELS[lot.rawMaterial.category as RawMaterialCategory] ??
                lot.rawMaterial.category}
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Supplier</div>
            <div className="stat-val" style={{ fontSize: 15 }}>{lot.supplier || '—'}</div>
            <div className="stat-unit">
              {lot.rawMaterial.spec ? lot.rawMaterial.spec.name : 'No spec on this material'}
            </div>
          </div>
        </div>
        {lot.notes && (
          <>
            <div className="add-sub" style={{ marginTop: 14 }}>
              Notes
            </div>
            <div className="rh-cell">{lot.notes}</div>
          </>
        )}
      </div>

      <div className="card" style={{ flexShrink: 0 }}>
        <div className="card-hdr">
          <div className="card-hdr-title">
            <i className="ti ti-clipboard-list" />
            Testing record
          </div>
        </div>
        <div className="card-body">
          {!lot.rawMaterial.spec ? (
            <div className="rule-note warn">
              <i className="ti ti-alert-triangle" />
              <div>
                This lot’s material has no component spec, so there is nothing to test against and
                the lot stays <b>pending</b>. Set one up on the{' '}
                <Link href={`/raw-materials/${lot.rawMaterial.id}`}>material page</Link> first.
              </div>
            </div>
          ) : activeCriteria.length === 0 ? (
            <div className="rule-note warn">
              <i className="ti ti-alert-triangle" />
              <div>
                This material’s spec has no active criteria, so the lot stays <b>pending</b>. “Every
                criterion passed” is vacuously true for an empty spec, which is exactly why it isn’t
                reported as a pass.
              </div>
            </div>
          ) : null}

          {activeCriteria.map((criterion) => {
            const latest = latestByCriterion.get(criterion.id);
            return (
              <CriterionBlock
                key={criterion.id}
                criterion={criterion}
                status={statusByCriterion.get(criterion.id) ?? 'pending'}
                tests={testsByCriterion.get(criterion.id) ?? []}
                latestResult={latest ? testResultText(latest) : null}
                lotId={lot.id}
                onChanged={onChanged}
              />
            );
          })}

          {activeCriteria.length > 0 && (
            <LogSpecTestForm lotId={lot.id} criteria={activeCriteria} onLogged={onChanged} />
          )}

          {retiredCriteria.length > 0 && (
            <>
              <div className="add-sub" style={{ marginTop: 18 }}>
                Results for retired parameters
              </div>
              <div className="rule-note">
                <i className="ti ti-archive" />
                <div>
                  These parameters were removed from the material’s spec after these results were
                  recorded. They are kept as part of this lot’s testing record, but they no longer
                  count toward its status and cannot take new results.
                </div>
              </div>
              {retiredCriteria.map((criterion) => {
                const latest = latestByCriterion.get(criterion.id);
                return (
                  <CriterionBlock
                    key={criterion.id}
                    criterion={criterion}
                    tests={testsByCriterion.get(criterion.id) ?? []}
                    latestResult={latest ? testResultText(latest) : null}
                    lotId={lot.id}
                    onChanged={onChanged}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
