import type { CiFailOn } from "@devdigest/shared";

/** "Fail CI on" options, ordered from most to least lenient (labels: `ciTab.failOn.*`). */
export const FAIL_ON_OPTIONS = ["never", "critical", "warning", "any"] as const satisfies readonly CiFailOn[];

/** Compact relative time ("now", "5m", "3h", "2d"); a local helper — next-intl's formatter needs a configured `now`. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
