import type { CalcResult } from '@/lib/calc-engine/types';

export interface RunRecord {
  id: string;
  label: string;
  mode: 'fresh' | 'regrind';
  inputs: Record<string, string>;
  result: CalcResult;
  createdAt: string;
}

interface RunHistoryPanelProps {
  runs: RunRecord[];
  loading: boolean;
  loadedRun: string | null;
  onLoadRun: (run: RunRecord) => void;
}

function metaLine(result: CalcResult): string {
  const mg = `${result.targetActiveMgPerTablet} mg`;
  if (result.mode === 'fresh') {
    return `${mg} · ${result.tabletCount.toLocaleString()} tabs`;
  }
  return `${mg} · ${result.regroundPowderG.toLocaleString()} g`;
}

export default function RunHistoryPanel({ runs, loading, loadedRun, onLoadRun }: RunHistoryPanelProps) {
  return (
    <div className="card">
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-history" /> Recent runs
        </div>
      </div>
      <div style={{ padding: '4px 0' }}>
        {loading ? (
          <div className="empty">
            <i className="ti ti-history" />
            Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="empty">
            <i className="ti ti-history" />
            No saved runs yet
          </div>
        ) : (
          runs.map((run) => (
            <button
              key={run.id}
              className={`run-item${loadedRun === run.id ? ' loaded' : ''}`}
              onClick={() => onLoadRun(run)}
            >
              <div className="run-name">{run.label}</div>
              <div className="run-meta">
                <span className={`run-tag ${run.mode === 'fresh' ? 'tag-fr' : 'tag-rg'}`}>
                  {run.mode === 'fresh' ? 'Fresh' : 'Regrind'}
                </span>
                {metaLine(run.result)}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
