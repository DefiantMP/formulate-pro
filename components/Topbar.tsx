import type { Mode } from './FormulateApp';

interface TopbarProps {
  mode: Mode;
  onReset: () => void;
  onSaveRun: () => void;
  saving: boolean;
  onPrint: () => void;
  canPrint: boolean;
}

export default function Topbar({ mode, onReset, onSaveRun, saving, onPrint, canPrint }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">New formulation run</span>
        <span className="mode-chip">{mode === 'fresh' ? 'Fresh batch' : 'Regrind'}</span>
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
        <button className="btn btn-p" onClick={onSaveRun} disabled={saving}>
          <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save run'}
        </button>
      </div>
    </div>
  );
}
