'use client';

import { useState, type FormEvent } from 'react';
import type { Mode } from './FormulateApp';

interface NewRunModalProps {
  mode: Mode;
  onSubmit: (name: string) => void;
}

/** Covers just the Inputs card (see FormulateApp's col-left wrapper) — Run History and the
 * rest of the app stay usable so an old run can still be loaded instead of starting a new one. */
export default function NewRunModal({ mode, onSubmit }: NewRunModalProps) {
  const [name, setName] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <div className="name-run-overlay">
      <form className="name-run-card" onSubmit={handleSubmit}>
        <div className="name-run-title">Name this run</div>
        <div className="name-run-desc">
          Give this {mode === 'fresh' ? 'fresh batch' : 'regrind'} run a name before entering values —
          every calculation will autosave under it as you go.
        </div>
        <input
          type="text"
          autoFocus
          placeholder="e.g. RR77-PB9 batch 3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn-p" disabled={!name.trim()}>
          <i className="ti ti-arrow-right" /> Start run
        </button>
      </form>
    </div>
  );
}
