/* Pure formatting helpers shared by the Evals tab, the eval dashboards and the
   Compare modal. Rates are fractions in [0, 1]; deltas are shown in percentage
   points ("pts"). */

const MINUS = "−"; // U+2212, matches the typography of the design system

/** "87%" for a rate, "n/a" when the value is undefined (null) or flagged not-applicable. */
export function formatRate(v: number | null | undefined, na?: boolean): string {
  if (v == null || na) return "n/a";
  return `${Math.round(v * 100)}%`;
}

/** Difference of two rates in percentage points, rounded to 1 decimal. */
export function deltaPp(curr: number, prev: number): number {
  return Math.round((curr - prev) * 1000) / 10;
}

/** "+2.0 pts" / "−4.0 pts" / "0.0 pts". */
export function formatSignedPp(d: number): string {
  const abs = Math.abs(d).toFixed(1);
  if (d > 0) return `+${abs} pts`;
  if (d < 0) return `${MINUS}${abs} pts`;
  return `${abs} pts`;
}

/** Signed USD difference "+$0.0123" / "−$0.0040"; "—" when either side is unpriced. */
export function formatCostDelta(a: number | null | undefined, b: number | null | undefined): string {
  if (a == null || b == null) return "—";
  const d = b - a;
  const abs = Math.abs(d).toFixed(4);
  if (d > 0) return `+$${abs}`;
  if (d < 0) return `${MINUS}$${abs}`;
  return `$${abs}`;
}

/** Plain USD for a run cost, "—" for an unpriced run (never "$0"). */
export function formatCost(v: number | null | undefined): string {
  return v == null ? "—" : `$${v.toFixed(4)}`;
}

/** Short local date+time for a run ("Oct 11, 14:03"). */
export function formatRunDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
