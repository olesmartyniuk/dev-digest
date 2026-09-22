import {
  OPEN_STATUSES,
  SIZE_MEDIUM_MAX,
  SIZE_SMALL_MAX,
  type PrMeta,
  type SizeInfo,
} from "./constants";

export interface PullsFilter {
  /** A `PrStatus`, or "all". */
  status: string;
  /** Free text over title and PR number. */
  query: string;
  /** "oldest" | anything else (newest first). */
  sort: string;
}

/** The list the table renders: status filter, then text search, then sort. */
export function filterAndSortPulls(pulls: PrMeta[], { status, query, sort }: PullsFilter): PrMeta[] {
  const q = query.trim().toLowerCase();
  return pulls
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return sort === "oldest" ? ta - tb : tb - ta;
    });
}

/** Header counts — over ALL pulls, deliberately not the filtered view. */
export function countPulls(pulls: PrMeta[]): { open: number; needsReview: number } {
  let open = 0;
  let needsReview = 0;
  for (const p of pulls) {
    if (OPEN_STATUSES.has(p.status)) open += 1;
    if (p.status === "needs_review") needsReview += 1;
  }
  return { open, needsReview };
}

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

/** Compact relative time for the list's UPDATED column (e.g. "3h", "2d"). */
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
