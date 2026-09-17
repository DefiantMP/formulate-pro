'use client';

import { useRef, useState } from 'react';
import Popover from './Popover';
import type { Mode } from './FormulateApp';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface TopbarProps {
  mode: Mode;
  runName: string;
  autosaveStatus: AutosaveStatus;
  /** Clears the form and reopens the naming prompt. */
  onNewRun: () => void;
  /** Whether the current run has anything in it worth warning about. */
  hasContent: boolean;
  onPrint: () => void;
  canPrint: boolean;
}

/**
 * This button used to be "Reset", which read as "wipe this run" — operators
 * avoided it and started their next batch by navigating away and back. It is
 * the same action, named for what it is actually for, and it says where the
 * current run went: a named run is already autosaved to Run history, so
 * starting another loses nothing.
 */
export default function Topbar({
  mode,
  runName,
  autosaveStatus,
  onNewRun,
  hasContent,
  onPrint,
  canPrint,
}: TopbarProps) {
  const [confirming, setConfirming] = useState(false);
  const newRunRef = useRef<HTMLButtonElement>(null);

  function handleNewRun() {
    // Nothing entered yet, or nothing at risk — just start over. The confirm
    // exists to reassure, not to nag on an empty form.
    if (!hasContent) {
      onNewRun();
      return;
    }
    setConfirming(true);
  }

  function confirm() {
    setConfirming(false);
    onNewRun();
  }

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
        <div className="newrun-wrap">
          <button ref={newRunRef} className="btn" onClick={handleNewRun} title="Start another run">
            <i className="ti ti-plus" /> New run
          </button>
          <Popover
            anchorRef={newRunRef}
            open={confirming}
            onClose={() => setConfirming(false)}
            width={252}
            label="Start another run?"
          >
            <div className="popover-title">Start another run?</div>
            <div className="popover-desc">
              {autosaveStatus === 'error' ? (
                <>
                  <b>Not saved.</b> Autosave failed, so this run would be lost. Check Run history
                  first.
                </>
              ) : autosaveStatus === 'saving' ? (
                <>Still saving — give it a moment.</>
              ) : (
                <>{runName || 'This run'} stays saved in Run history.</>
              )}
            </div>
            <div className="popover-actions">
              <button className="btn btn-sm" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm btn-p"
                onClick={confirm}
                disabled={autosaveStatus === 'saving'}
              >
                Start new run
              </button>
            </div>
          </Popover>
        </div>
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
