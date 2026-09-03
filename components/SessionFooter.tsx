'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { USER_ROLE_LABELS, type UserRole } from '@/lib/auth';

interface Me { id: string; name: string; email: string; role: string }

/** Replaces the hardcoded "J. Doe / Pro plan" placeholder with the real
 *  session, or a sign-in link when signed out. */
export default function SessionFooter() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const load = useCallback(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setMe(null);
    router.refresh();
  }

  if (me === undefined) return <div className="sidebar-foot" />;

  if (!me) {
    return (
      <div className="sidebar-foot">
        <Link href="/sign-in" className="nav-btn">
          <i className="ti ti-login" /> Sign in
        </Link>
      </div>
    );
  }

  const initials = me.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="sidebar-foot">
      <div className="auth-user">
        <div className="user-row" style={{ cursor: 'default' }}>
          <div className="av">{initials}</div>
          <div>
            <div className="user-name">{me.name}</div>
            <div className="user-plan">{USER_ROLE_LABELS[me.role as UserRole] ?? me.role}</div>
          </div>
        </div>
        <button type="button" className="auth-signout" onClick={signOut} title="Sign out">
          <i className="ti ti-logout" />
        </button>
      </div>
    </div>
  );
}
