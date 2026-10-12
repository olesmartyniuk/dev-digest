import { normalizeEvalPath } from '@devdigest/reviewer-core';
import type {
  EvalCaseDecision,
  EvalCaseView,
  EvalDashboard,
  EvalExpectationItem,
  EvalMetricNa,
  EvalRegression,
  EvalRun,
  EvalRunConfig,
  EvalRunRecord,
  EvalRunSummary,
  EvalTrendPoint,
  FindingCategory,
  Severity,
} from '@devdigest/shared';
import { CASE_NAME_MAX, REGRESSION_THRESHOLD, TREND_LIMIT } from './constants.js';

/**
 * Pure eval helpers (domain ring): no Fastify, no Drizzle, no adapters, no db/.
 * Row shapes are declared structurally below (rather than imported from db/rows)
 * so this file stays free of the persistence layer; the real Drizzle rows are
 * assignable to them.
 */

// ---- structural row shapes --------------------------------------------------

export interface FindingLike {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
  title: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export interface CaseRowLike {
  id: string;
  ownerKind: 'skill' | 'agent';
  ownerId: string;
  name: string;
  inputDiff: string | null;
  inputFiles: unknown;
  inputMeta: unknown;
  expectedOutput: unknown;
  notes: string | null;
  agentId: string | null;
  sourceFindingId: string | null;
  createdAt: Date;
}

export interface RunRowLike {
  id: string;
  caseId: string;
  ranAt: Date;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

export interface BatchRowLike {
  id: string;
  agentId: string;
  agentVersion: number;
  configJson: unknown;
  status: 'running' | 'done' | 'failed';
  partial: boolean;
  caseIds: unknown;
  startedAt: Date;
  finishedAt: Date | null;
  aggregate: unknown;
  na: unknown;
  costUsd: number | null;
  erroredCount: number;
  error: string | null;
}

// ---- finding -> case --------------------------------------------------------

/**
 * Cut the block of a raw multi-file unified diff that belongs to `file`
 * (header + every hunk). Returns null when the file is not in the diff. Capping
 * the fragment to the finding's file keeps a case small (spec: large diffs).
 */
export function extractFileFragment(raw: string, file: string): string | null {
  const wanted = normalizeEvalPath(file);
  const blocks = raw.split(/^(?=diff --git )/m);
  for (const block of blocks) {
    if (!block.startsWith('diff --git ')) continue;
    const plus = block.match(/^\+\+\+ (.+)$/m);
    const header = block.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    const candidates = [plus?.[1]?.trim(), header?.[2]?.trim(), header?.[1]?.trim()];
    if (candidates.some((c) => c && c !== '/dev/null' && normalizeEvalPath(c) === wanted)) {
      return block.endsWith('\n') ? block : `${block}\n`;
    }
  }
  return null;
}

/** Which decision a finding carries; if both timestamps are set the later one wins. */
export function decisionOf(f: {
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}): EvalCaseDecision | null {
  const { acceptedAt, dismissedAt } = f;
  if (acceptedAt && dismissedAt) {
    return acceptedAt.getTime() >= dismissedAt.getTime() ? 'accepted' : 'dismissed';
  }
  if (acceptedAt) return 'accepted';
  if (dismissedAt) return 'dismissed';
  return null;
}

export function expectationFromFinding(
  f: FindingLike,
  decision: EvalCaseDecision,
): EvalExpectationItem {
  return {
    kind: decision === 'accepted' ? 'must_find' : 'must_not_flag',
    file: f.file,
    start_line: f.startLine,
    end_line: f.endLine,
    severity: f.severity as Severity,
    category: f.category as FindingCategory,
    title: f.title,
  };
}

/** kebab slug of the title, truncated, plus the first 6 chars of the finding id. */
export function caseNameFromFinding(title: string, findingId: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CASE_NAME_MAX - 7)
    .replace(/-+$/g, '');
  const suffix = findingId.replace(/-/g, '').slice(0, 6);
  return slug ? `${slug}-${suffix}` : `finding-${suffix}`;
}

// ---- views ------------------------------------------------------------------

/** Defensive read of the jsonb column — anything that is not an item array counts as empty. */
function itemsOf(expected: unknown): EvalExpectationItem[] {
  return Array.isArray(expected) ? (expected as EvalExpectationItem[]) : [];
}

export function summarizeExpectation(items: EvalExpectationItem[]): EvalCaseView['summary'] {
  const withBoth = items.find((i) => i.severity && i.category);
  return {
    items: items.length,
    must_find: items.filter((i) => i.kind === 'must_find').length,
    must_not_flag: items.filter((i) => i.kind === 'must_not_flag').length,
    chip: withBoth ? `${withBoth.severity}·${withBoth.category}` : null,
  };
}

export function lastRunView(
  expected: unknown,
  last: RunRowLike | null,
): EvalCaseView['last_run'] {
  const expectedCount = itemsOf(expected).filter((i) => i.kind === 'must_find').length;
  if (!last) {
    return {
      status: 'never_run',
      ran_at: null,
      expected_count: expectedCount,
      actual_count: null,
      recall: null,
      precision: null,
      citation_accuracy: null,
      duration_ms: null,
    };
  }
  const errored = last.pass === null;
  const actual = last.actualOutput as { kept?: unknown[] } | null;
  return {
    status: errored ? 'errored' : last.pass ? 'passed' : 'failed',
    ran_at: last.ranAt.toISOString(),
    expected_count: expectedCount,
    actual_count: errored ? null : Array.isArray(actual?.kept) ? actual.kept.length : null,
    recall: last.recall,
    precision: last.precision,
    citation_accuracy: last.citationAccuracy,
    duration_ms: last.durationMs,
  };
}

export function caseRowToView(row: CaseRowLike, last: RunRowLike | null): EvalCaseView {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles ?? null,
    input_meta: row.inputMeta ?? null,
    expected_output: row.expectedOutput ?? [],
    notes: row.notes,
    agent_id: row.agentId,
    source_finding_id: row.sourceFindingId,
    created_at: row.createdAt.toISOString(),
    summary: summarizeExpectation(itemsOf(row.expectedOutput)),
    last_run: lastRunView(row.expectedOutput, last),
  };
}

const NO_NA: EvalMetricNa = { recall: false, precision: false, citation_accuracy: false };

export function batchToSummary(
  batch: BatchRowLike,
  agentName: string,
  model: string,
): EvalRunSummary {
  const caseIds = Array.isArray(batch.caseIds) ? (batch.caseIds as string[]) : [];
  return {
    id: batch.id,
    agent_id: batch.agentId,
    agent_name: agentName,
    agent_version: batch.agentVersion,
    model,
    status: batch.status,
    partial: batch.partial,
    started_at: batch.startedAt.toISOString(),
    finished_at: batch.finishedAt ? batch.finishedAt.toISOString() : null,
    case_ids: caseIds,
    case_count: caseIds.length,
    errored_count: batch.erroredCount,
    cost_usd: batch.costUsd,
    error: batch.error,
    aggregate: (batch.aggregate as EvalRun | null) ?? null,
    na: (batch.na as EvalMetricNa | null) ?? NO_NA,
  };
}

export function batchConfig(batch: BatchRowLike): EvalRunConfig {
  const c = (batch.configJson ?? {}) as Partial<EvalRunConfig>;
  return {
    provider: c.provider ?? '',
    model: c.model ?? '',
    system_prompt: c.system_prompt ?? '',
    strategy: c.strategy ?? '',
    skill_ids: c.skill_ids ?? [],
  };
}

export function caseRunToRecord(run: RunRowLike, caseName: string): EvalRunRecord {
  return {
    id: run.id,
    case_id: run.caseId,
    case_name: caseName,
    ran_at: run.ranAt.toISOString(),
    actual_output: run.actualOutput,
    pass: run.pass,
    recall: run.recall,
    precision: run.precision,
    citation_accuracy: run.citationAccuracy,
    duration_ms: run.durationMs,
    cost_usd: run.costUsd,
  };
}

/** One issue string per expectation item whose file is absent from the case diff. */
export function validateCaseAgainstDiff(
  items: EvalExpectationItem[],
  diffFilePaths: string[],
): string[] {
  const present = new Set(diffFilePaths.map(normalizeEvalPath));
  const issues: string[] = [];
  items.forEach((item, i) => {
    if (!present.has(normalizeEvalPath(item.file))) {
      issues.push(`expected_output[${i}]: file "${item.file}" is not in the case diff`);
    }
  });
  return issues;
}

// ---- dashboard --------------------------------------------------------------

type MetricKey = EvalRegression['metric'];
const METRICS: MetricKey[] = ['recall', 'precision', 'citation_accuracy'];
const METRIC_LABEL: Record<MetricKey, string> = {
  recall: 'Recall',
  precision: 'Precision',
  citation_accuracy: 'Citation accuracy',
};

const isFullRun = (b: BatchRowLike) =>
  !b.partial && b.status === 'done' && b.aggregate != null;

export function trendPointOf(b: BatchRowLike): EvalTrendPoint {
  const agg = b.aggregate as EvalRun;
  return {
    ran_at: b.startedAt.toISOString(),
    recall: agg.recall,
    precision: agg.precision,
    citation_accuracy: agg.citation_accuracy,
    pass_rate: agg.traces_total === 0 ? 1 : agg.traces_passed / agg.traces_total,
    cost_usd: agg.cost_usd,
  };
}

/** Chronological (oldest -> newest) trend over the FULL, finished runs only. */
export function trendOf(batchesNewestFirst: BatchRowLike[]): EvalTrendPoint[] {
  return batchesNewestFirst.filter(isFullRun).slice(0, TREND_LIMIT).reverse().map(trendPointOf);
}

/**
 * Dashboard math for one agent. `batches` must be newest first. Full runs =
 * `partial=false && status='done' && aggregate != null`; partial and failed runs
 * never feed the trend, the current numbers, the deltas or the regression check.
 */
export function buildAgentDashboard(
  agentId: string,
  casesTotal: number,
  batches: BatchRowLike[],
  latestFullCaseRecords: EvalRunRecord[],
): { dashboard: EvalDashboard; regression: EvalRegression | null } {
  const full = batches.filter(isFullRun);
  const latest = full[0];
  const previous = full[1];
  const latestAgg = latest ? (latest.aggregate as EvalRun) : null;
  const prevAgg = previous ? (previous.aggregate as EvalRun) : null;

  const delta = {
    recall: latestAgg && prevAgg ? latestAgg.recall - prevAgg.recall : 0,
    precision: latestAgg && prevAgg ? latestAgg.precision - prevAgg.precision : 0,
    citation_accuracy:
      latestAgg && prevAgg ? latestAgg.citation_accuracy - prevAgg.citation_accuracy : 0,
  };

  let regression: EvalRegression | null = null;
  if (latest && previous && latestAgg && prevAgg) {
    let worst = 0;
    for (const metric of METRICS) {
      // Round away float noise (0.82 - 0.80 = 0.0199999...) so exactly 2 pp fires.
      const drop = Math.round((prevAgg[metric] - latestAgg[metric]) * 1e6) / 1e6;
      if (drop >= REGRESSION_THRESHOLD && drop > worst) {
        worst = drop;
        regression = {
          metric,
          drop,
          version: latest.agentVersion,
          previous_version: previous.agentVersion,
        };
      }
    }
  }

  const alert = regression
    ? `${METRIC_LABEL[regression.metric]} dropped ${(regression.drop * 100).toFixed(1)} pts in v${regression.version} vs v${regression.previous_version}`
    : null;

  const dashboard: EvalDashboard = {
    owner_kind: 'agent',
    owner_id: agentId,
    cases_total: casesTotal,
    current: {
      recall: latestAgg?.recall ?? 0,
      precision: latestAgg?.precision ?? 0,
      citation_accuracy: latestAgg?.citation_accuracy ?? 0,
      traces_passed: latestAgg?.traces_passed ?? 0,
      traces_total: latestAgg?.traces_total ?? 0,
      cost_usd: latestAgg?.cost_usd ?? null,
    },
    delta,
    trend: trendOf(batches),
    recent_runs: latestFullCaseRecords,
    alert,
  };
  return { dashboard, regression };
}

/** The newest full, finished batch (used to pick which per-case records to load). */
export function latestFullBatch<T extends BatchRowLike>(batchesNewestFirst: T[]): T | undefined {
  return batchesNewestFirst.find(isFullRun);
}
