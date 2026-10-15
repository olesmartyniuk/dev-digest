import type { EvalMetricNa, EvalRunSummary, EvalTrendPoint } from "@devdigest/shared";

/** Series colours match the tiles (recall / precision / citation). */
const COLORS = { recall: "var(--ok)", precision: "var(--accent)", citation: "var(--warn)" } as const;

/** Three metric series for the trend chart. `t` resolves the `eval` namespace legend labels. */
export function trendSeries(trend: EvalTrendPoint[], t: (key: string) => string) {
  return [
    { name: t("dashboard.legend.recall"), color: COLORS.recall, data: trend.map((p) => p.recall) },
    { name: t("dashboard.legend.precision"), color: COLORS.precision, data: trend.map((p) => p.precision) },
    { name: t("dashboard.legend.citation"), color: COLORS.citation, data: trend.map((p) => p.citation_accuracy) },
  ];
}

/** y-axis floor: 0.6 unless a point dips below it. */
export function trendYMin(trend: EvalTrendPoint[]): number {
  const min = Math.min(...trend.flatMap((p) => [p.recall, p.precision, p.citation_accuracy]));
  return Math.min(0.6, Math.floor(min * 10) / 10);
}

/** `na` flags of the newest FULL finished run (tiles render "n/a" for vacuous metrics). */
export function latestNa(runs: EvalRunSummary[]): EvalMetricNa | undefined {
  return runs.find((r) => !r.partial && r.status === "done" && r.aggregate != null)?.na;
}
