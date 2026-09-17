'use client';

import { useState } from 'react';
import {
  EXCIPIENT_ROLE_LABELS,
  type AmountVerdict,
  type BlendRationale,
} from '@/lib/knownExcipients';
import type { ExcipientRationaleReply } from '@/lib/excipientRationale';

const VERDICT_LABEL: Record<AmountVerdict, string> = {
  typical: 'Typical amount',
  'below-typical': 'Below typical',
  'above-typical': 'Above typical',
  unknown: 'Not in reference table',
  'top-up': 'Fresh top-up',
};

function rangeText(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (max === null) return `${min}% or more`;
  if (min === null) return `up to ${max}%`;
  return `${min}–${max}%`;
}

/**
 * Explains a blend: what each excipient is doing, whether its level is
 * typical, and which jobs nothing is doing.
 *
 * Every verdict is advisory. "Above typical" means outside the range the
 * reference table knows, never "wrong" — real formulations sit outside
 * typical ranges for reasons this app cannot see, and a tool that cries
 * wrong about a good formulation teaches people to ignore it.
 */
export default function BlendRationalePanel({ rationale }: { rationale: BlendRationale }) {
  const [aiResults, setAiResults] = useState<Record<string, ExcipientRationaleReply | { error: string } | 'loading'>>({});

  async function explain(name: string, percentOfBlend: number) {
    setAiResults((r) => ({ ...r, [name]: 'loading' }));
    try {
      const res = await fetch('/api/excipient-rationale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, percentOfBlend }),
      });
      const d = await res.json().catch(() => null);
      setAiResults((r) => ({
        ...r,
        [name]: res.ok ? (d as ExcipientRationaleReply) : { error: d?.error || 'Could not explain this material.' },
      }));
    } catch {
      setAiResults((r) => ({ ...r, [name]: { error: 'Could not reach the server.' } }));
    }
  }

  if (rationale.items.length === 0) {
    return (
      <div className="empty">
        <i className="ti ti-help-circle" />
        Enter a formulation to see what each excipient is doing
      </div>
    );
  }

  return (
    <div className="rationale">
      <div className="field-hint" style={{ marginBottom: 10 }}>
        General direct-compression reference points, not your product spec. A level outside a
        typical range is flagged as unusual, never as wrong.
      </div>

      {rationale.items.map((item) => {
        const ai = aiResults[item.name];
        const aiOk = ai && ai !== 'loading' && !('error' in ai) ? ai : null;
        return (
          <div className={`rationale-row v-${item.verdict}`} key={item.name}>
            <div className="rationale-hdr">
              <div className="rationale-name">{item.name}</div>
              <div className="rationale-pct">{item.percentOfBlend.toFixed(2)}%</div>
              <div className={`rationale-verdict v-${item.verdict}`}>{VERDICT_LABEL[item.verdict]}</div>
            </div>

            {item.profile ? (
              <>
                <div className="rationale-role">{EXCIPIENT_ROLE_LABELS[item.profile.role]}</div>
                <div className="rationale-text">{item.profile.purpose}</div>
                <div className="rationale-text">{item.message}</div>
              </>
            ) : aiOk ? (
              <>
                <div className="rationale-role">
                  AI explanation{aiOk.uncertain ? ' — model was not certain what this material is' : ''}
                </div>
                <div className="rationale-text">{aiOk.purpose}</div>
                {rangeText(aiOk.typicalMinPercent, aiOk.typicalMaxPercent) && (
                  <div className="rationale-text">
                    Typically {rangeText(aiOk.typicalMinPercent, aiOk.typicalMaxPercent)} of the blend.
                  </div>
                )}
                {aiOk.caution && <div className="rationale-text">{aiOk.caution}</div>}
                <div className="field-hint">
                  Suggested by the AI model, not from the reference table — check it against your own spec.
                </div>
              </>
            ) : (
              <>
                <div className="rationale-text">{item.message}</div>
                {ai && ai !== 'loading' && 'error' in ai && <div className="rm-inline-err">{ai.error}</div>}
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 6 }}
                  disabled={ai === 'loading'}
                  onClick={() => explain(item.name, item.percentOfBlend)}
                >
                  <i className="ti ti-sparkles" /> {ai === 'loading' ? 'Asking…' : 'Ask AI what this is'}
                </button>
              </>
            )}
          </div>
        );
      })}

      {rationale.gaps.map((gap) => (
        <div className="warn-row rationale-gap" key={gap.role}>
          <i className="ti ti-alert-triangle" />
          <div>
            <b>No {EXCIPIENT_ROLE_LABELS[gap.role].toLowerCase()} in this blend.</b> {gap.message}
          </div>
        </div>
      ))}
    </div>
  );
}
