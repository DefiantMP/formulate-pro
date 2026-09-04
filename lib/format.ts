export function numOrZero(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function fmt(n: number, dec = 1): string {
  if (!isFinite(n) || n <= 0) return '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtK(n: number): string {
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toLocaleString();
}

/**
 * A signed quantity, for values that are legitimately negative.
 *
 * fmt() above clamps anything <= 0 to '0' — correct for weights, which cannot
 * be negative, and load-bearing wherever an unset field must not read as a
 * real figure. That clamp silently turned a -50g stock adjustment into "0 g",
 * so deltas need their own formatter rather than a change to fmt().
 */
export function fmtSigned(n: number, dec = 2): string {
  if (!isFinite(n)) return '0';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return sign + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/**
 * <input type="date"> round-trips, deliberately done in LOCAL time.
 *
 * `new Date('2026-08-13')` parses as UTC midnight, which then renders as the
 * 12th anywhere west of Greenwich. For a received date or a tested date
 * that's a records defect, not a cosmetic one — the day an operator typed
 * has to be the day that comes back out. Building from local midnight keeps
 * the two ends agreeing.
 */
export function dateInputToIso(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

export function isoToDateInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
