// Number / delta formatting for the admin console. Arabic-Indic digits app-wide; a compact form
// for big counts so a KPI tile never overflows, and a period-over-period delta helper for the
// ▲/▼ pills next to sparklines.

const AR = 'ar-EG';

/** Plain grouped integer -- `1234` → `١٬٢٣٤`. */
export function nf(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString(AR);
}

/** Compact for ≥ 10k -- `12345` → `١٢٫٣ ألف`, `2_100_000` → `٢٫١ مليون`. Below 10k falls back to nf(). */
export function compact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs < 10_000) return nf(n);
  if (abs < 1_000_000) return `${(n / 1_000).toLocaleString(AR, { maximumFractionDigits: 1 })} ألف`;
  return `${(n / 1_000_000).toLocaleString(AR, { maximumFractionDigits: 1 })} مليون`;
}

/** `0.732` → `٧٣٪`. Pass a ratio (0–1) or set `fromRatio=false` for an already-scaled percent. */
export function pct(value: number | null | undefined, fromRatio = true): string {
  if (value == null || Number.isNaN(value)) return '—';
  const scaled = fromRatio ? value * 100 : value;
  return `${scaled.toLocaleString(AR, { maximumFractionDigits: 1 })}٪`;
}

export type DeltaDir = 'up' | 'down' | 'flat';

export interface Delta {
  /** Rounded percentage change, absolute value. `null` when there's no prior baseline. */
  pct: number | null;
  dir: DeltaDir;
  /** Signed absolute change (current − previous). */
  abs: number;
}

/** Period-over-period change. `previous === 0` with a positive current reads as "new", dir 'up'. */
export function delta(current: number, previous: number): Delta {
  const abs = current - previous;
  if (previous === 0) {
    return { pct: current === 0 ? 0 : null, dir: current > 0 ? 'up' : 'flat', abs };
  }
  const change = (abs / previous) * 100;
  const dir: DeltaDir = Math.abs(change) < 0.5 ? 'flat' : change > 0 ? 'up' : 'down';
  return { pct: Math.round(Math.abs(change)), dir, abs };
}

/** Signed compact label for a delta's percentage, e.g. `▲ ١٢٪` handled by the caller's icon. */
export function deltaLabel(d: Delta): string {
  if (d.pct == null) return 'جديد';
  return d.dir === 'flat' ? 'ثابت' : `${d.pct.toLocaleString(AR)}٪`;
}
