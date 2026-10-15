import { z } from 'zod';
import { Finding, Severity, FindingCategory } from './findings.js';
import { EvalCase, EvalRun } from './knowledge.js';
import { EvalCaseInput, EvalRunRecord, EvalTrendPoint, EvalDashboard } from './eval-ci.js';

/**
 * L06 — Eval pipeline contracts (SPEC-04).
 *
 * NEW file: extends the barrel without touching `knowledge.ts` / `eval-ci.ts`.
 * Covers the expectation encoding stored in `eval_cases.expected_output`, the
 * case/run/batch API shapes and the per-agent + workspace dashboards.
 *
 * Imports deliberately avoid `Provider` / `CiFailOn`, which have drifted between
 * the server and client vendored copies.
 */

// ===========================================================================
// Expectation (stored in eval_cases.expected_output)
// ===========================================================================

export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationKind = z.infer<typeof EvalExpectationKind>;

export const EvalExpectationItem = z
  .object({
    kind: EvalExpectationKind,
    file: z.string().min(1),
    start_line: z.number().int().positive(),
    /** Defaults to `start_line` in scoring. */
    end_line: z.number().int().positive().optional(),
    /** Descriptive only — never part of matching. */
    severity: Severity.optional(),
    category: FindingCategory.optional(),
    title: z.string().optional(),
  })
  .strict(); // typo'd keys (e.g. "line") -> 422
export type EvalExpectationItem = z.infer<typeof EvalExpectationItem>;

export const EvalExpectation = z.array(EvalExpectationItem);
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalCaseDecision = z.enum(['accepted', 'dismissed']);
export type EvalCaseDecision = z.infer<typeof EvalCaseDecision>;

export const EvalCaseMeta = z.object({
  title: z.string().default(''),
  body: z.string().default(''),
  source_finding_id: z.string().optional(),
  source_pr_id: z.string().optional(),
  decision: EvalCaseDecision.optional(),
  origin: z.enum(['seed', 'finding', 'manual']).optional(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

/** Create/update body for /agents/:id/eval-cases and /eval-cases/:id (owner from the route). */
export const EvalCaseBody = EvalCaseInput.omit({
  owner_kind: true,
  owner_id: true,
  input_files: true,
}).extend({
  input_diff: z.string().min(1).max(200_000),
  input_meta: EvalCaseMeta.optional(),
  expected_output: EvalExpectation,
  name: z.string().min(1).max(120),
});
export type EvalCaseBody = z.infer<typeof EvalCaseBody>;
export type EvalCaseBodyInput = z.input<typeof EvalCaseBody>;

// ===========================================================================
// Scoring + per-case results
// ===========================================================================

export const EvalCaseScore = z.object({
  expected_find: z.number().int(),
  found: z.number().int(),
  kept: z.number().int(),
  noise: z.number().int(),
  dropped: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  pass: z.boolean(),
});
export type EvalCaseScore = z.infer<typeof EvalCaseScore>;

export const EvalCaseActualOutput = z.object({
  kept: z.array(Finding),
  dropped: z.array(z.object({ finding: Finding, reason: z.string() })),
  /** null when the case errored. */
  score: EvalCaseScore.nullable(),
  error: z.string().nullable(),
});
export type EvalCaseActualOutput = z.infer<typeof EvalCaseActualOutput>;

export const EvalCaseLastRunStatus = z.enum(['passed', 'failed', 'errored', 'never_run']);
export type EvalCaseLastRunStatus = z.infer<typeof EvalCaseLastRunStatus>;

export const EvalCaseView = EvalCase.extend({
  agent_id: z.string().nullable(),
  source_finding_id: z.string().nullable(),
  created_at: z.string(),
  summary: z.object({
    items: z.number().int(),
    must_find: z.number().int(),
    must_not_flag: z.number().int(),
    /** "CRITICAL·security" | null (UI renders "empty []"). */
    chip: z.string().nullable(),
  }),
  last_run: z.object({
    status: EvalCaseLastRunStatus,
    ran_at: z.string().nullable(),
    expected_count: z.number().int(),
    actual_count: z.number().int().nullable(),
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
    duration_ms: z.number().int().nullable(),
  }),
});
export type EvalCaseView = z.infer<typeof EvalCaseView>;

export const TurnIntoEvalCaseResponse = z.object({ case: EvalCaseView, created: z.boolean() });
export type TurnIntoEvalCaseResponse = z.infer<typeof TurnIntoEvalCaseResponse>;

// ===========================================================================
// Runs (batches)
// ===========================================================================

export const EvalRunStatus = z.enum(['running', 'done', 'failed']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

export const StartEvalRunBody = z.object({
  case_ids: z.array(z.string().uuid()).min(1).max(200).optional(),
});
export type StartEvalRunBody = z.infer<typeof StartEvalRunBody>;

export const EvalRunConfig = z.object({
  provider: z.string(),
  model: z.string(),
  system_prompt: z.string(),
  strategy: z.string(),
  skill_ids: z.array(z.string()),
});
export type EvalRunConfig = z.infer<typeof EvalRunConfig>;

export const EvalMetricNa = z.object({
  recall: z.boolean(),
  precision: z.boolean(),
  citation_accuracy: z.boolean(),
});
export type EvalMetricNa = z.infer<typeof EvalMetricNa>;

export const EvalRunSummary = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  agent_version: z.number().int(),
  model: z.string(),
  status: EvalRunStatus,
  partial: z.boolean(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  case_ids: z.array(z.string()),
  case_count: z.number().int(),
  errored_count: z.number().int(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
  /** null while running / when failed before any case. */
  aggregate: EvalRun.nullable(),
  /** true => the run-level value is the vacuous 1; render "n/a". */
  na: EvalMetricNa,
});
export type EvalRunSummary = z.infer<typeof EvalRunSummary>;

export const StartEvalRunResponse = z.object({ run: EvalRunSummary });
export type StartEvalRunResponse = z.infer<typeof StartEvalRunResponse>;

export const EvalRunDetail = EvalRunSummary.extend({
  config: EvalRunConfig,
  cases: z.array(EvalRunRecord),
});
export type EvalRunDetail = z.infer<typeof EvalRunDetail>;

// ===========================================================================
// Dashboards
// ===========================================================================

export const EvalRegression = z.object({
  metric: z.enum(['recall', 'precision', 'citation_accuracy']),
  /** Positive fraction, e.g. 0.04. */
  drop: z.number(),
  version: z.number().int(),
  previous_version: z.number().int(),
});
export type EvalRegression = z.infer<typeof EvalRegression>;

export const AgentEvalDashboard = z.object({
  /** Existing contract; recent_runs = latest full run's per-case records. */
  dashboard: EvalDashboard,
  /** RECENT RUNS table (newest first, full + partial). */
  runs: z.array(EvalRunSummary),
  regression: EvalRegression.nullable(),
});
export type AgentEvalDashboard = z.infer<typeof AgentEvalDashboard>;

export const EvalAgentCard = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  last_run: EvalRunSummary.nullable(),
  trend: z.array(EvalTrendPoint),
});
export type EvalAgentCard = z.infer<typeof EvalAgentCard>;

export const EvalWorkspaceDashboard = z.object({
  agents: z.array(EvalAgentCard),
  recent_runs: z.array(EvalRunSummary),
});
export type EvalWorkspaceDashboard = z.infer<typeof EvalWorkspaceDashboard>;
