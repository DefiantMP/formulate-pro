import BucketFillCalculator from './BucketFillCalculator';

/**
 * Post-press bench page: what should the scale read once this bucket holds
 * the tablet count I want?
 *
 * Deliberately its own route rather than a tab on /scale-verify, even
 * though it's the same operator at the same scale: scale verification
 * checks dispensed ingredient weights *before* pressing, and this runs on
 * finished tablets *after*. Filing them together under one heading would
 * mislabel one of them at whichever end of the process the operator is
 * standing.
 */
export default function BucketFillPage() {
  return (
    <div className="sv-page">
      <div className="sv-hdr">
        <div className="sv-title">Bucket fill target</div>
        <div className="sv-subtitle">
          Work out the scale reading to fill an untared bucket to for a given tablet count.
        </div>
      </div>
      <BucketFillCalculator />
    </div>
  );
}
