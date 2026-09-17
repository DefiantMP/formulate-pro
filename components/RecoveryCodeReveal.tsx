'use client';

import { useState } from 'react';

/**
 * Shows a recovery code exactly once. The code is not stored anywhere it can
 * be read back, so Continue stays disabled until the person confirms they
 * have saved it — skipping past it silently is how an account ends up with
 * no way back in.
 */
export default function RecoveryCodeReveal({
  code,
  heading,
  onContinue,
  continueLabel = 'Continue',
}: {
  code: string;
  heading: string;
  onContinue: () => void;
  continueLabel?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="recovery-reveal">
      <div className="sub-lbl">{heading}</div>
      <div className="field-hint" style={{ marginBottom: 10 }}>
        If you forget your password, this code lets you set a new one. Write it down or print it
        and keep it somewhere safe. <b>It will not be shown again</b>, and each code works once —
        you get a new one after using it.
      </div>
      <div className="recovery-code">{code}</div>
      <div className="row" style={{ justifyContent: 'center', marginBottom: 10 }}>
        <button type="button" className="btn" onClick={copy}>
          <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn" onClick={() => window.print()}>
          <i className="ti ti-printer" /> Print
        </button>
      </div>
      <label className="recovery-ack">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved this code somewhere safe
      </label>
      <button
        type="button"
        className="btn btn-p"
        style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
        disabled={!saved}
        onClick={onContinue}
      >
        {continueLabel}
      </button>
    </div>
  );
}
