export default function TipsCard() {
  return (
    <div className="card">
      <div className="card-hdr">
        <div className="card-hdr-title">
          <i className="ti ti-bulb" /> Tips
        </div>
      </div>
      <div className="card-body">
        <div className="tip">
          <strong>Regrind batches:</strong> MagSter and PVPP are already in the powder. Adding more
          risks soft, capping tablets.
        </div>
        <div className="tip">
          <strong>Option B:</strong> Use the tablet&apos;s pressed weight — not any later adjusted
          weight — for accurate potency back-calculation.
        </div>
        <div className="tip">
          <strong>Emdex in regrind:</strong> Only added to make up the weight difference between old
          and new tablet size.
        </div>
      </div>
    </div>
  );
}
