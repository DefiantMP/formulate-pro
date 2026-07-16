import type { VarianceRow } from '@/lib/calc-engine/types';

export type TabKey = 'output' | 'variance' | 'sop';

export interface AddRowData {
  label: string;
  value: string;
  icon: string;
  key: boolean;
}

export interface StatsData {
  tablets: string;
  blend: string;
  potency: string;
  mgPerTab: string;
}

export interface LotBreakdownRow {
  label: string;
  weightG: number;
  potencyPercent: number;
  isStart: boolean;
  fillerType: string;
}

interface OutputPanelProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  hasResult: boolean;
  stats: StatsData | null;
  addRows: AddRowData[];
  warnRows: string[];
  lotBreakdown: LotBreakdownRow[] | null;
  varianceRows: VarianceRow[];
  sopSteps: string[];
  /** Overrides the default empty-state text — e.g. a regrind solve-mode validation or infeasibility error. */
  emptyMessage?: string | null;
}

export default function OutputPanel({
  activeTab,
  onTabChange,
  hasResult,
  stats,
  addRows,
  warnRows,
  lotBreakdown,
  varianceRows,
  sopSteps,
  emptyMessage,
}: OutputPanelProps) {
  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="tabs">
        <div
          className={`tab${activeTab === 'output' ? ' active' : ''}`}
          onClick={() => onTabChange('output')}
        >
          Output
        </div>
        <div
          className={`tab${activeTab === 'variance' ? ' active' : ''}`}
          onClick={() => onTabChange('variance')}
        >
          Variances
        </div>
        <div
          className={`tab${activeTab === 'sop' ? ' active' : ''}`}
          onClick={() => onTabChange('sop')}
        >
          SOP
        </div>
      </div>

      {activeTab === 'output' && (
        <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
          {!hasResult || !stats ? (
            <div className="empty">
              <i className={`ti ti-${emptyMessage ? 'alert-triangle' : 'flask-2'}`} />
              {emptyMessage ?? 'Enter values on the left to see formulation output'}
            </div>
          ) : (
            <div>
              <div className="stats">
                <div className="stat">
                  <div className="stat-lbl">Tablets</div>
                  <div className="stat-val">{stats.tablets}</div>
                  <div className="stat-unit">per run</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Total blend</div>
                  <div className="stat-val">{stats.blend}</div>
                  <div className="stat-unit">grams</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Active potency</div>
                  <div className="stat-val">{stats.potency}</div>
                  <div className="stat-unit">of blend</div>
                </div>
                <div className="stat">
                  <div className="stat-lbl">Verified mg / tab</div>
                  <div className="stat-val">{stats.mgPerTab}</div>
                  <div className="stat-unit">mg</div>
                </div>
              </div>
              <div className="add-sub">Add to V-mix</div>
              <div>
                {addRows.map((row) => (
                  <div key={row.label} className={`add-row${row.key ? ' key' : ''}`}>
                    <div className="add-lbl">
                      <i className={`ti ti-${row.icon}`} />
                      {row.label}
                    </div>
                    <div className={`add-val${row.key ? ' green' : ''}`}>{row.value}</div>
                  </div>
                ))}
                {warnRows.map((warning) => (
                  <div className="warn-row" key={warning}>
                    <i className="ti ti-alert-triangle" />
                    {warning}
                  </div>
                ))}
              </div>
              {lotBreakdown && (
                <div style={{ marginTop: 14 }}>
                  <div className="add-sub">Lot breakdown</div>
                  <div>
                    {lotBreakdown.map((lot) => (
                      <div className="lot-breakdown-row" key={lot.label}>
                        <div className="lot-breakdown-lbl">
                          {lot.label}
                          {lot.fillerType && <span className="lot-breakdown-filler">{lot.fillerType}</span>}
                          {lot.isStart && <span className="lot-badge">Starts</span>}
                        </div>
                        <div className="lot-breakdown-val">
                          {lot.weightG.toLocaleString('en-US', { maximumFractionDigits: 0 })} g @{' '}
                          {lot.potencyPercent.toFixed(2)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'variance' && (
        <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
          {!hasResult || varianceRows.length === 0 ? (
            <div className="empty">
              <i className={`ti ti-${emptyMessage ? 'alert-triangle' : 'ruler-measure'}`} />
              {emptyMessage ?? 'Enter target values first'}
            </div>
          ) : (
            <table className="var-tbl">
              <thead>
                <tr>
                  <th>Weight (g)</th>
                  <th>Step</th>
                  <th>Potency (mg)</th>
                </tr>
              </thead>
              <tbody>
                {varianceRows.map((row) => (
                  <tr key={row.step} className={row.step === 0 ? 'tgt' : ''}>
                    <td>{row.weightG.toFixed(3)}</td>
                    <td>
                      {row.step >= 0 ? '+' : ''}
                      {row.step}
                    </td>
                    <td>{row.potencyMg.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'sop' && (
        <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
          {!hasResult || sopSteps.length === 0 ? (
            <div className="empty">
              <i className={`ti ti-${emptyMessage ? 'alert-triangle' : 'list-check'}`} />
              {emptyMessage ?? 'SOP auto-generates from your inputs'}
            </div>
          ) : (
            <div>
              {sopSteps.map((step, i) => (
                <div key={i} className="sop-item">
                  <div className="sop-n">{i + 1}</div>
                  <div>{step}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
