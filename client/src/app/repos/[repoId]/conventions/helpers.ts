import type { Convention, ConventionDrop } from "@devdigest/shared";
import { CONFIDENCE_STRONG, CONFIDENCE_WARN } from "./constants";

/** Pure helpers for the Conventions route. */

export interface ConventionCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export function countConventions(list: Convention[]): ConventionCounts {
  return {
    total: list.length,
    pending: list.filter((c) => c.status === "pending").length,
    accepted: list.filter((c) => c.status === "accepted").length,
    rejected: list.filter((c) => c.status === "rejected").length,
  };
}

/**
 * Display order: undecided first (that is the work), then accepted, then
 * rejected. Within a bucket, higher confidence first — the strongest evidence
 * is what a reviewer should judge while their attention is freshest.
 */
const STATUS_ORDER: Record<Convention["status"], number> = {
  pending: 0,
  accepted: 1,
  rejected: 2,
};

export function sortConventions(list: Convention[]): Convention[] {
  return [...list].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.confidence - a.confidence,
  );
}

/** Colour for a confidence bar, matching the design system's ok/warn tokens. */
export function confidenceColor(value: number): string {
  if (value >= CONFIDENCE_STRONG) return "var(--ok)";
  if (value >= CONFIDENCE_WARN) return "var(--warn)";
  return "var(--text-muted)";
}

/** Tally drop reasons so the scan summary can explain a thin result. */
export function groupDrops(drops: ConventionDrop[]): { reason: string; count: number }[] {
  const byReason = new Map<string, number>();
  for (const d of drops) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
  return [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/** `src/api/users.ts:23` — the citation format used everywhere in the app. */
export function citation(c: Convention): string {
  return `${c.evidence.path}:${c.evidence.line}`;
}
