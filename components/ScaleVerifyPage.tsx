'use client';

import { useState } from 'react';
import ScaleVerifySubmitPage from './ScaleVerifySubmitPage';
import BucketFillCalculator from './BucketFillCalculator';

/**
 * Shell for the two halves of the same bench workflow: computing the scale
 * reading to fill an untared bucket to, and photographing a scale reading
 * to verify it. They share a page (and this mobile-width layout) because
 * they're the same operator at the same scale, minutes apart.
 */
type Tab = 'verify' | 'bucket';

const COPY: Record<Tab, { title: string; subtitle: string }> = {
  verify: {
    title: 'Scale verification',
    subtitle: "Photograph a scale reading to verify it against a run's calculated expected weight.",
  },
  bucket: {
    title: 'Bucket fill target',
    subtitle: 'Work out the scale reading to fill an untared bucket to for a given tablet count.',
  },
};

export default function ScaleVerifyPage() {
  const [tab, setTab] = useState<Tab>('verify');

  return (
    <div className="sv-page">
      <div className="sv-hdr">
        <div className="sv-title">{COPY[tab].title}</div>
        <div className="sv-subtitle">{COPY[tab].subtitle}</div>
      </div>

      <div className="sv-tabs">
        <button
          type="button"
          className={`sv-tab${tab === 'verify' ? ' active' : ''}`}
          onClick={() => setTab('verify')}
        >
          <i className="ti ti-camera" /> Verify a reading
        </button>
        <button
          type="button"
          className={`sv-tab${tab === 'bucket' ? ' active' : ''}`}
          onClick={() => setTab('bucket')}
        >
          <i className="ti ti-bucket" /> Bucket fill
        </button>
      </div>

      {tab === 'verify' ? <ScaleVerifySubmitPage /> : <BucketFillCalculator />}
    </div>
  );
}
