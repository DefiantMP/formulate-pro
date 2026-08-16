'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-name">Formulate</div>
        <div className="logo-tag">Pro · Beta</div>
      </div>
      <nav className="nav">
        <div className="nav-section">Workspace</div>
        <Link href="/" className={`nav-btn${pathname === '/' ? ' active' : ''}`}>
          <i className="ti ti-flask" /> New run
        </Link>
        <Link href="/run-history" className={`nav-btn${pathname === '/run-history' ? ' active' : ''}`}>
          <i className="ti ti-history" /> Run history
        </Link>
        <Link
          href="/formulations"
          className={`nav-btn${pathname.startsWith('/formulations') ? ' active' : ''}`}
        >
          <i className="ti ti-library" /> Formulations
        </Link>
        {/* /lots/[id] is reached only from a material, and has no list page of
            its own, so it highlights this entry too rather than nothing. */}
        <Link
          href="/raw-materials"
          className={`nav-btn${
            pathname.startsWith('/raw-materials') || pathname.startsWith('/lots') ? ' active' : ''
          }`}
        >
          <i className="ti ti-package" /> Raw materials
        </Link>
        <div className="nav-section" style={{ marginTop: 8 }}>
          R&D Suite
        </div>
        <Link href="/iterations" className={`nav-btn${pathname === '/iterations' ? ' active' : ''}`}>
          <i className="ti ti-chart-line" /> Iterations
        </Link>
        <Link href="/troubleshoot" className={`nav-btn${pathname === '/troubleshoot' ? ' active' : ''}`}>
          <i className="ti ti-bug" /> Troubleshoot
        </Link>
        <Link href="/lab-notes" className={`nav-btn${pathname === '/lab-notes' ? ' active' : ''}`}>
          <i className="ti ti-notes" /> Lab notes
        </Link>
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
