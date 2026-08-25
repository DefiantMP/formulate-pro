import Sidebar from './Sidebar';

/**
 * App shell for the phone-first bench pages (/scale-verify, /bucket-fill).
 *
 * These started life as standalone pages with no sidebar — an operator
 * reaches them on a phone, and a 196px nav rail on a 375px screen costs
 * more than it gives. But that also made them unreachable except by typing
 * the URL. This gives them the same nav as every other page on a desktop
 * and drops the rail below 768px, so neither audience pays for the other.
 *
 * The `app-bench` class scopes that responsive behaviour to these pages
 * only: the rest of the app has no breakpoints at all, and this is
 * deliberately not the place to introduce them wholesale.
 */
export default function BenchShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app app-bench">
      <Sidebar />
      <div className="main">{children}</div>
    </div>
  );
}
