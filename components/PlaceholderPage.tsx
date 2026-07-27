import Sidebar from './Sidebar';

interface PlaceholderPageProps {
  title: string;
  icon: string;
  description: string;
}

/**
 * Minimal, non-persistent placeholder for an R&D Suite section — just
 * enough of a real page for the Formulations builder to link to. No AI
 * chatbot, no persistent memory system — full functionality is a separate,
 * later build.
 */
export default function PlaceholderPage({ title, icon, description }: PlaceholderPageProps) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">{title}</div>
          </div>
        </div>
        <div className="rh-page">
          <div className="card">
            <div className="empty">
              <i className={`ti ti-${icon}`} />
              {description}
              <div style={{ marginTop: 6 }}>Coming soon.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
