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
          <strong>Raw material potency:</strong> this is the purity of the raw active-ingredient
          material (e.g. an assay result), not the ingredient&apos;s % of the finished blend. The
          blend % is calculated for you from potency, target mg/tablet, and target tablet weight.
        </div>
        <div className="tip">
          <strong>Regrind batches:</strong> PVPP is already in the powder — don&apos;t add fresh.
          MagSter is mostly already present too; the app automatically adds a small 1% fresh
          top-up on top of that, shown in the output — don&apos;t add more than that.
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
