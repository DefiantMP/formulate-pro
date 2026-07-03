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
