import type { EvalExpectationItem } from "@devdigest/shared";

/* Pure helpers for the eval case editor. Validation here mirrors the
   server-side EvalExpectationItem schema for UX only (no zod value import, so
   the zod runtime stays out of the client bundle); server-side Zod stays
   authoritative and rejects anything this lets through with a 422. */

const KINDS = ["must_find", "must_not_flag"] as const;
const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
const CATEGORIES = ["bug", "security", "perf", "style", "test"] as const;
const ALLOWED_KEYS = new Set(["kind", "file", "start_line", "end_line", "severity", "category", "title"]);

export type ParsedExpected =
  | { ok: true; items: EvalExpectationItem[] }
  | { ok: false; reason: "json" | "schema" };

/** What "Finding skeleton" inserts. */
export const FINDING_SKELETON: EvalExpectationItem = {
  kind: "must_find",
  severity: "CRITICAL",
  category: "security",
  title: "",
  file: "",
  start_line: 1,
};

const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

function validItem(raw: unknown): raw is EvalExpectationItem {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => !ALLOWED_KEYS.has(k))) return false;
  if (!oneOf(KINDS, o.kind)) return false;
  if (typeof o.file !== "string" || o.file.length === 0) return false;
  if (!isPosInt(o.start_line)) return false;
  if (o.end_line !== undefined && !isPosInt(o.end_line)) return false;
  if (o.severity !== undefined && !oneOf(SEVERITIES, o.severity)) return false;
  if (o.category !== undefined && !oneOf(CATEGORIES, o.category)) return false;
  if (o.title !== undefined && typeof o.title !== "string") return false;
  return true;
}

/** JSON parse + structural check. `reason` tells the badge which kind of invalid it is. */
export function parseExpected(text: string): ParsedExpected {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!Array.isArray(value) || !value.every(validItem)) return { ok: false, reason: "schema" };
  return { ok: true, items: value };
}

/** Append the skeleton item to the editor text (an unparseable text is replaced by a one-item array). */
export function appendSkeleton(text: string): string {
  const parsed = parseExpected(text);
  const items = parsed.ok ? parsed.items : [];
  return JSON.stringify([...items, FINDING_SKELETON], null, 2);
}

const norm = (p: string) => p.replace(/^(a\/|b\/|\.\/)/, "");

/** A must_find and a must_not_flag item on overlapping lines of one file: one finding would count as both found and noise. */
export function hasContradiction(items: EvalExpectationItem[]): boolean {
  const finds = items.filter((i) => i.kind === "must_find");
  const nots = items.filter((i) => i.kind === "must_not_flag");
  return finds.some((f) =>
    nots.some((n) => {
      if (norm(f.file) !== norm(n.file)) return false;
      const fHi = f.end_line ?? f.start_line;
      const nHi = n.end_line ?? n.start_line;
      return Math.max(f.start_line, n.start_line) <= Math.min(fHi, nHi);
    }),
  );
}
