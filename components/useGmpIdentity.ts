'use client';

import { useEffect, useState } from 'react';

/**
 * Whether GMP mode is on, and who is signed in — for forms whose "by" field
 * is a typed name with GMP off but the signed-in account with it on. The
 * server enforces this regardless; this only keeps the form honest about
 * what will actually be recorded, instead of asking for a name it ignores.
 */
export function useGmpIdentity(): { loaded: boolean; gmpOn: boolean; me: { id: string; name: string; role: string } | null } {
  const [state, setState] = useState<{ loaded: boolean; gmpOn: boolean; me: { id: string; name: string; role: string } | null }>({
    loaded: false,
    gmpOn: false,
    me: null,
  });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/gmp').then((r) => (r.ok ? r.json() : { enabled: false })).catch(() => ({ enabled: false })),
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : { user: null })).catch(() => ({ user: null })),
    ]).then(([gmp, me]) => {
      if (!cancelled) setState({ loaded: true, gmpOn: !!gmp.enabled, me: me.user ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
