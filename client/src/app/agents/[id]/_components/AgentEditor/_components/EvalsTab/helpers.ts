import type { EvalCaseView, EvalMetricNa, EvalRunSummary } from "@devdigest/shared";

/** Cases whose latest run passed. */
export function passingCount(cases: EvalCaseView[]): number {
  return cases.filter((c) => c.last_run.status === "passed").length;
}

/** `na` flags of the newest FULL finished run, so tiles render "n/a" for vacuous metrics. */
export function latestFullNa(runs: EvalRunSummary[] | undefined): EvalMetricNa | undefined {
  return runs?.find((r) => !r.partial && r.status === "done" && r.aggregate != null)?.na;
}

/** In-flight state, server-sourced: a running full run, or a running single-case run. */
export function runningState(runs: EvalRunSummary[] | undefined): {
  isRunningAll: boolean;
  runningCaseId: string | null;
} {
  const running = (runs ?? []).filter((r) => r.status === "running");
  const isRunningAll = running.some((r) => !r.partial);
  const single = running.find((r) => r.partial && r.case_ids.length === 1);
  return { isRunningAll, runningCaseId: single?.case_ids[0] ?? null };
}
