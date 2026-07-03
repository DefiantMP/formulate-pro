export interface RunMeta {
  name: string;
  tag: string;
  tagClass: 'tag-rg' | 'tag-fr';
  meta: string;
}

interface RunHistoryPanelProps {
  runs: RunMeta[];
  loadedRun: number | null;
  onLoadRun: (index: number) => void;
}

export default function RunHistoryPanel({ runs, loadedRun, onLoadRun }: RunHistoryPanelProps) {
  return (
    <div className="card">
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-history" /> Recent runs
        </div>
      </div>
      <div style={{ padding: '4px 0' }}>
        {runs.map((run, i) => (
          <button
            key={run.name}
            className={`run-item${loadedRun === i ? ' loaded' : ''}`}
            onClick={() => onLoadRun(i)}
          >
            <div className="run-name">{run.name}</div>
            <div className="run-meta">
              <span className={`run-tag ${run.tagClass}`}>{run.tag}</span>
              {run.meta}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
