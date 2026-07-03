export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-name">Formulate</div>
        <div className="logo-tag">Pro · Beta</div>
      </div>
      <nav className="nav">
        <div className="nav-section">Workspace</div>
        <button className="nav-btn active">
          <i className="ti ti-flask" /> New run
        </button>
        <button className="nav-btn">
          <i className="ti ti-history" /> Run history
        </button>
        <button className="nav-btn">
          <i className="ti ti-library" /> Formulations
        </button>
        <div className="nav-section" style={{ marginTop: 8 }}>
          R&D Suite
        </div>
        <button className="nav-btn">
          <i className="ti ti-chart-line" /> Iterations
        </button>
        <button className="nav-btn">
          <i className="ti ti-bug" /> Troubleshoot
        </button>
        <button className="nav-btn">
          <i className="ti ti-notes" /> Lab notes
        </button>
        <div className="nav-section" style={{ marginTop: 8 }}>
          Account
        </div>
        <button className="nav-btn">
          <i className="ti ti-building-factory-2" /> Products
        </button>
        <button className="nav-btn">
          <i className="ti ti-settings" /> Settings
        </button>
      </nav>
      <div className="sidebar-foot">
        <div className="user-row">
          <div className="av">JD</div>
          <div>
            <div className="user-name">J. Doe</div>
            <div className="user-plan">Pro plan</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
