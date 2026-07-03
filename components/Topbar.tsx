import type { Mode } from './FormulateApp';

interface TopbarProps {
  mode: Mode;
  onReset: () => void;
}

export default function Topbar({ mode, onReset }: TopbarProps) {
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
        <button className="btn btn-p">
          <i className="ti ti-device-floppy" /> Save run
        </button>
      </div>
    </div>
  );
}
