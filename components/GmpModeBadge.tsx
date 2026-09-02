'use client';

import { useEffect, useState } from 'react';

/**
 * Global "GMP mode is on" indicator.
 *
 * Renders nothing when the mode is off — an always-present badge reading
 * "GMP: off" would train people to stop reading it, and the state that
 * matters operationally is the one where extra checks are enforced.
 */
export default function GmpModeBadge() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch('/api/gmp')
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => {
          if (!cancelled && d) setEnabled(!!d.enabled);
        })
        .catch(() => {});
    }
    load();
    // The mode is account-level and can be changed from another tab or by
    // another operator mid-session; a slow poll keeps the indicator honest
    // without a websocket.
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!enabled) return null;
  return (
    <div className="gmp-badge" title="GMP mode is on — Part 111 checks are enforced">
      <i className="ti ti-shield-check" /> GMP MODE
    </div>
  );
}
