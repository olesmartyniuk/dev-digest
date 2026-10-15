import type { EvalRunDetail } from "@devdigest/shared";
import { deltaPp, formatCost, formatCostDelta, formatRate, formatSignedPp } from "@/components/eval-metrics";

/** Order two runs old -> new by `started_at` — never by click order (AC-33). */
export function orderOldNew<T extends { started_at: string }>(a: T, b: T): [T, T] {
  return Date.parse(a.started_at) <= Date.parse(b.started_at) ? [a, b] : [b, a];
}

export interface MetricRow {
  key: "recall" | "precision" | "citation" | "cost";
  old: string;
  next: string;
  /** Signed delta text; "—" when either side is not comparable. */
  delta: string;
  /** Sign of the change for colouring: > 0 better, < 0 worse (cost: lower is better). */
  direction: 1 | -1 | 0;
}

const RATES = [
  ["recall", "recall"],
  ["precision", "precision"],
  ["citation", "citation_accuracy"],
] as const;

/** `old -> new` + signed delta per metric: rates in percentage points, cost in USD. */
export function metricDeltas(
  older: Pick<EvalRunDetail, "aggregate" | "na" | "cost_usd">,
  newer: Pick<EvalRunDetail, "aggregate" | "na" | "cost_usd">,
): MetricRow[] {
  const rows: MetricRow[] = RATES.map(([key, field]) => {
    const o = older.aggregate?.[field];
    const n = newer.aggregate?.[field];
    const comparable = o != null && n != null && !older.na[field] && !newer.na[field];
    const d = comparable ? deltaPp(n, o) : 0;
    return {
      key,
      old: formatRate(o, older.na[field]),
      next: formatRate(n, newer.na[field]),
      delta: comparable ? formatSignedPp(d) : "—",
      direction: d > 0 ? 1 : d < 0 ? -1 : 0,
    };
  });
  const cd = older.cost_usd != null && newer.cost_usd != null ? newer.cost_usd - older.cost_usd : 0;
  rows.push({
    key: "cost",
    old: formatCost(older.cost_usd),
    next: formatCost(newer.cost_usd),
    delta: formatCostDelta(older.cost_usd, newer.cost_usd),
    direction: cd < 0 ? 1 : cd > 0 ? -1 : 0,
  });
  return rows;
}

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

/** Pure LCS line diff of two texts (system prompts are short, so O(n*m) is fine). */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const lcs: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: x[i++]! });
    } else {
      out.push({ kind: "add", text: y[j++]! });
    }
  }
  while (i < x.length) out.push({ kind: "del", text: x[i++]! });
  while (j < y.length) out.push({ kind: "add", text: y[j++]! });
  return out;
}

/** Same set of cases (order-insensitive)? Otherwise the deltas are not like-for-like (AC-34). */
export function sameCaseSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
