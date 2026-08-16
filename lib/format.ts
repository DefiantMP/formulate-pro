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
