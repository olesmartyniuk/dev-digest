/**
 * Canonical severity semantics for the UI.
 *
 * `Severity` itself is a `@devdigest/shared` contract value; how it SORTS and
 * which colour token it maps to is UI policy, so it lives here. Kept in one
 * place because these mappings were previously restated in four components and
 * had already drifted in naming (`SEVERITY_ORDER` vs `SEVERITY_SORT_WEIGHT`).
 */

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_SORT_WEIGHT: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Unknown/future severities sort last rather than first. */
const UNKNOWN_SEVERITY_WEIGHT = 9;

/** `.sort()` comparator — worst severity first. */
export function compareBySeverity(a: { severity: string }, b: { severity: string }): number {
  return (
    (SEVERITY_SORT_WEIGHT[a.severity] ?? UNKNOWN_SEVERITY_WEIGHT) -
    (SEVERITY_SORT_WEIGHT[b.severity] ?? UNKNOWN_SEVERITY_WEIGHT)
  );
}

/** Severity → CSS colour token. */
export const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};

/** Colour for a severity the UI doesn't know about. */
export const SEVERITY_COLOR_FALLBACK = "var(--text-muted)";

export function severityColor(severity: string): string {
  return SEVERITY_COLOR[severity] ?? SEVERITY_COLOR_FALLBACK;
}
