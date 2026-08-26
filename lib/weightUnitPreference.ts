/**
 * Persists the operator's last-used weight-entry unit (mg vs g) across
 * formulations, per-browser — this app has no auth/session concept to key a
 * per-user preference off (see CLAUDE.md's Secrets & Environment notes:
 * Prisma + SQLite, no accounts), so localStorage is the right granularity.
 *
 * Guarded for SSR: Next.js renders this component's first pass on the
 * server, where `window`/`localStorage` don't exist, so every accessor
 * checks `typeof window` and falls back to the 'g' default rather than
 * throwing. A private window, cleared site data, or a blocking browser
 * setting can also make localStorage throw or come back empty — callers
 * must tolerate that, not treat it as if a preference was explicitly set.
 */

const STORAGE_KEY = 'formulate-pro:weight-entry-unit';

export type WeightEntryUnit = 'g' | 'mg';

export function getPreferredWeightUnit(): WeightEntryUnit {
  if (typeof window === 'undefined') return 'g';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'mg' ? 'mg' : 'g';
  } catch {
    return 'g';
  }
}

export function setPreferredWeightUnit(unit: WeightEntryUnit): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // Best-effort only — a full or blocked store just means the preference
    // doesn't persist this session, not a functional failure.
  }
}
