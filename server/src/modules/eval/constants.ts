/** Constants for the eval module (SPEC-04). */

import { EvalRunStatus } from '@devdigest/shared';

// Batch status values, taken from the shared contract enum (no inline literals elsewhere).
export const BATCH_STATUS_DONE = EvalRunStatus.enum.done;
export const BATCH_STATUS_FAILED = EvalRunStatus.enum.failed;

/** A metric must drop by at least this fraction (2 pp) vs the previous full run to raise the alert (AC-36). */
export const REGRESSION_THRESHOLD = 0.02;

/** Max points on the metric trend. */
export const TREND_LIMIT = 20;

/** Max rows in the per-agent run history. */
export const RUN_HISTORY_LIMIT = 50;

/** Max rows in the workspace-wide "recent runs" table. */
export const RECENT_RUNS_LIMIT = 20;

/** Max length of a generated case name. */
export const CASE_NAME_MAX = 60;

/** Per-route cap on starting eval runs (each run = one LLM review per case). */
export const EVAL_RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/** Error text stamped on a batch reaped at boot (R6 analogue). */
export const STALE_RUN_ERROR = 'Interrupted by server restart';

// Stable error codes (AppError.code).
export const ERR_FINDING_UNDECIDED = 'finding_undecided';
export const ERR_FINDING_NO_AGENT = 'finding_no_agent';
export const ERR_DIFF_UNAVAILABLE = 'diff_unavailable';
export const ERR_RUN_IN_PROGRESS = 'eval_run_in_progress';
export const ERR_NO_CASES = 'eval_no_cases';
export const ERR_INVALID_CASE = 'eval_invalid_case';
