'use client';

import { useState } from 'react';
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
          <button className="btn" onClick={handleNewRun} title="Start another run">
            <i className="ti ti-plus" /> New run
          </button>
          {confirming && (
            <div className="newrun-confirm">
              <div className="newrun-confirm-title">Start another run?</div>
              <div className="newrun-confirm-desc">
                {autosaveStatus === 'error' ? (
                  <>
                    <b>{runName || 'This run'} has not saved.</b> Autosave failed, so clearing the
                    form now loses what is on screen. Check Run history first.
                  </>
                ) : autosaveStatus === 'saving' ? (
                  <>Still saving {runName || 'this run'} — give it a moment, then start the next one.</>
                ) : (
                  <>
                    <b>{runName || 'This run'}</b> is saved in Run history and stays there. You are
                    only clearing the form to enter the next batch.
                  </>
                )}
              </div>
              <div className="row">
                <button className="btn btn-p" onClick={confirm} disabled={autosaveStatus === 'saving'}>
                  <i className="ti ti-plus" /> Start new run
                </button>
                <button className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
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
