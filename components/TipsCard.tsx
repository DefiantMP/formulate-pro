import type { Mode } from './FormulateApp';

interface TipsCardProps {
  mode: Mode;
  /** True when any current lot/API is entering potency via mg-per-tablet ("Option B") rather than bulk %. */
  usingOptionB: boolean;
}

/**
 * Tips are filtered by mode (regrind-specific tips hidden in fresh-batch
 * mode) and by whether Option B potency entry is actually in use — the
 * "Raw material potency" tip is the only one generic enough to always apply.
 */
export default function TipsCard({ mode, usingOptionB }: TipsCardProps) {
  return (
    // flexShrink: 0 — see RunHistoryPanel.tsx for why this matters in .col-right's flex column.
    <div className="card" style={{ flexShrink: 0 }}>
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-bulb" /> Tips
        </div>
      </div>
      <div className="card-body">
        <div className="tip">
          <strong>Raw material potency:</strong> this is the purity of the raw active-ingredient
          material (e.g. an assay result), not the ingredient&apos;s % of the finished blend. The
          blend % is calculated for you from potency, target mg/tablet, and target tablet weight.
        </div>
        {mode === 'regrind' && (
          <div className="tip">
            <strong>Regrind batches:</strong> PVPP is already in the powder — don&apos;t add fresh.
            MagSter is mostly already present too; the app automatically adds a small 1% fresh
            top-up on top of that, shown in the output — don&apos;t add more than that.
          </div>
        )}
        {usingOptionB && (
          <div className="tip">
            <strong>Option B:</strong> Use the tablet&apos;s pressed weight — not any later adjusted
            weight — for accurate potency back-calculation.
          </div>
        )}
        {mode === 'regrind' && (
          <div className="tip">
            <strong>Emdex in regrind:</strong> Only added to make up the weight difference between old
            and new tablet size.
          </div>
        )}
      </div>
    </div>
  );
}
