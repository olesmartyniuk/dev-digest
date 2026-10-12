import type {
  EvalCaseScore,
  EvalExpectationItem,
  EvalMetricNa,
  EvalRun,
} from '@devdigest/shared';

/**
 * Eval scoring — PURE, deterministic, LLM-free (SPEC-04 AC-19..23).
 *
 * Plain data in, plain data out: there is no `LLMProvider` (or any I/O) in any
 * signature here. "Survived the gate" is read straight from the engine result
 * (`ReviewOutcome.review.findings` = kept, `ReviewOutcome.dropped.length` =
 * dropped) — the grounding gate is never re-implemented.
 *
 * Definitions (per case): E_find / E_not = expectation items by kind,
 * K = surviving findings, D = candidates dropped by the gate.
 *   found     = |{ i in E_find : some f in K matches i }|
 *   noise     = |{ f in K : f matches some i in E_not }|
 *   recall    = found / |E_find|                     (null if |E_find| = 0)
 *   precision = (|K| - noise) / |K|                  (null if |K| = 0)
 *   citation  = |K| / (|K| + |D|)                    (null if |K| + |D| = 0)
 *   pass      = found = |E_find| AND noise = 0 AND (E empty => |K| = 0)
 * A finding matches an item iff normalized file paths are equal and the
 * inclusive line ranges overlap. Severity / category / title never match.
 *
 * Aggregate costs: an errored case has no outcome, so it contributes neither
 * to any metric denominator nor to `cost_usd`.
 */

/** Strip ONE leading `a/`, `b/` or `./`; comparison is exact and case-sensitive. */
export function normalizeEvalPath(p: string): string {
  if (p.startsWith('./')) return p.slice(2);
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2);
  return p;
}

/** Inclusive overlap of two line ranges; each range is normalized to [min, max]. */
export function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  const aLo = Math.min(a[0], a[1]);
  const aHi = Math.max(a[0], a[1]);
  const bLo = Math.min(b[0], b[1]);
  const bHi = Math.max(b[0], b[1]);
  return Math.max(aLo, bLo) <= Math.min(aHi, bHi);
}

export interface EvalScoreFinding {
  file: string;
  start_line: number;
  end_line: number;
}

export interface ScoreEvalCaseInput {
  expected: EvalExpectationItem[];
  /** Findings that survived the grounding gate. */
  kept: EvalScoreFinding[];
  /** Number of candidates the gate dropped. */
  droppedCount: number;
}

function matches(item: EvalExpectationItem, f: EvalScoreFinding): boolean {
  if (normalizeEvalPath(item.file) !== normalizeEvalPath(f.file)) return false;
  return rangesOverlap(
    [item.start_line, item.end_line ?? item.start_line],
    [f.start_line, f.end_line],
  );
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

export function scoreEvalCase(input: ScoreEvalCaseInput): EvalCaseScore {
  const { expected, kept, droppedCount } = input;
  const mustFind = expected.filter((e) => e.kind === 'must_find');
  const mustNot = expected.filter((e) => e.kind === 'must_not_flag');

  const found = mustFind.filter((item) => kept.some((f) => matches(item, f))).length;
  const noise = kept.filter((f) => mustNot.some((item) => matches(item, f))).length;

  const pass =
    found === mustFind.length && noise === 0 && (expected.length > 0 || kept.length === 0);

  return {
    expected_find: mustFind.length,
    found,
    kept: kept.length,
    noise,
    dropped: droppedCount,
    recall: ratio(found, mustFind.length),
    precision: ratio(kept.length - noise, kept.length),
    citation_accuracy: ratio(kept.length, kept.length + droppedCount),
    pass,
  };
}

export interface ScoredEvalCase {
  name: string;
  expected: EvalExpectationItem[];
  actual: unknown;
  /** null => the case errored (excluded from every denominator and from cost). */
  score: EvalCaseScore | null;
  costUsd: number | null;
}

export interface EvalAggregate {
  run: EvalRun;
  na: EvalMetricNa;
  erroredCount: number;
}

/**
 * Micro-averaged run aggregate over the NON-errored cases. A zero run-level
 * denominator fills the non-null `EvalRun` contract with the vacuous value `1`
 * and flags the metric in `na` so the UI can render "n/a".
 */
export function aggregateEvalScores(cases: ScoredEvalCase[], wallMs: number): EvalAggregate {
  const scored = cases.filter(
    (c): c is ScoredEvalCase & { score: EvalCaseScore } => c.score !== null,
  );

  let found = 0;
  let expectedFind = 0;
  let kept = 0;
  let noise = 0;
  let dropped = 0;
  let passed = 0;
  let cost: number | null = scored.length === 0 ? null : 0;
  for (const c of scored) {
    found += c.score.found;
    expectedFind += c.score.expected_find;
    kept += c.score.kept;
    noise += c.score.noise;
    dropped += c.score.dropped;
    if (c.score.pass) passed += 1;
    cost = cost === null || c.costUsd === null ? null : cost + c.costUsd;
  }

  const recall = ratio(found, expectedFind);
  const precision = ratio(kept - noise, kept);
  const citation = ratio(kept, kept + dropped);

  return {
    run: {
      recall: recall ?? 1,
      precision: precision ?? 1,
      citation_accuracy: citation ?? 1,
      traces_passed: passed,
      traces_total: scored.length,
      duration_ms: Math.max(0, Math.round(wallMs)),
      cost_usd: cost,
      per_trace: cases.map((c) => ({
        name: c.name,
        pass: c.score?.pass ?? false,
        expected: c.expected,
        actual: c.actual,
      })),
    },
    na: {
      recall: recall === null,
      precision: precision === null,
      citation_accuracy: citation === null,
    },
    erroredCount: cases.length - scored.length,
  };
}
