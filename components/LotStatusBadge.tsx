import type { LotSpecStatus } from '@/lib/lotSpecStatus';

const LABELS: Record<LotSpecStatus, string> = { pass: 'Pass', fail: 'Fail', pending: 'Pending' };
const ICONS: Record<LotSpecStatus, string> = {
  pass: 'circle-check',
  fail: 'circle-x',
  pending: 'clock-hour-4',
};

/**
 * A lot's QC verdict. Only ever fed the server-computed rollup — never a
 * status derived from the latest test, which would reintroduce retest
 * laundering in the presentation layer.
 */
export default function LotStatusBadge({ status }: { status: LotSpecStatus }) {
  return (
    <span className={`spec-status ${status}`}>
      <i className={`ti ti-${ICONS[status]}`} />
      {LABELS[status]}
    </span>
  );
}
