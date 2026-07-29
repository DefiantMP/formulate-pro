import type { Mode } from './FormulateApp';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface TopbarProps {
  mode: Mode;
  runName: string;
  autosaveStatus: AutosaveStatus;
  onReset: () => void;
  onPrint: () => void;
  canPrint: boolean;
}

export default function Topbar({ mode, runName, autosaveStatus, onReset, onPrint, canPrint }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{runName || 'New formulation run'}</span>
        <span className="mode-chip">{mode === 'fresh' ? 'Fresh batch' : 'Regrind'}</span>
        {autosaveStatus === 'saving' && (
          <span className="autosave-status">
            <i className="ti ti-loader-2" /> Saving…
          </span>
        )}
        {autosaveStatus === 'saved' && (
          <span className="autosave-status saved">
            <i className="ti ti-circle-check" /> Saved
          </span>
        )}
        {autosaveStatus === 'error' && (
          <span className="autosave-status error">
            <i className="ti ti-alert-triangle" /> Autosave failed
          </span>
        )}
      </div>
      <div className="topbar-right">
        <button className="btn" onClick={onReset}>
          <i className="ti ti-refresh" /> Reset
        </button>
        <button
          className="btn"
          onClick={onPrint}
          disabled={!canPrint}
          title={canPrint ? 'Print batch instructions' : 'Enter values to see output before printing'}
        >
          <i className="ti ti-printer" /> Print batch instructions
        </button>
      </div>
    </div>
  );
}
