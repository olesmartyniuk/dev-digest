import { describe, it, expect, expectTypeOf } from 'vitest';
import type { EvalExpectationItem, LLMProvider, StructuredRequest, StructuredResult, UnifiedDiff } from '@devdigest/shared';
import {
  aggregateEvalScores,
  normalizeEvalPath,
  rangesOverlap,
  reviewPullRequest,
  scoreEvalCase,
  type ScoredEvalCase,
  type ScoreEvalCaseInput,
} from '../src/index.js';

const find = (file: string, start: number, end?: number): EvalExpectationItem => ({
  kind: 'must_find',
  file,
  start_line: start,
  ...(end !== undefined ? { end_line: end } : {}),
});
const not = (file: string, start: number, end?: number): EvalExpectationItem => ({
  kind: 'must_not_flag',
  file,
  start_line: start,
  ...(end !== undefined ? { end_line: end } : {}),
});
const f = (file: string, s: number, e = s) => ({ file, start_line: s, end_line: e });

describe('normalizeEvalPath / rangesOverlap', () => {
  it('strips exactly one leading a/ b/ ./ prefix, case-sensitively', () => {
    expect(normalizeEvalPath('a/src/x.ts')).toBe('src/x.ts');
    expect(normalizeEvalPath('b/src/x.ts')).toBe('src/x.ts');
    expect(normalizeEvalPath('./src/x.ts')).toBe('src/x.ts');
    expect(normalizeEvalPath('a/a/x.ts')).toBe('a/x.ts');
    expect(normalizeEvalPath('A/x.ts')).toBe('A/x.ts');
    expect(normalizeEvalPath('src/x.ts')).toBe('src/x.ts');
  });

  it('is inclusive at touching ends, exclusive when adjacent, and order-insensitive', () => {
    expect(rangesOverlap([5, 7], [7, 9])).toBe(true);
    expect(rangesOverlap([5, 6], [7, 9])).toBe(false);
    expect(rangesOverlap([9, 5], [7, 7])).toBe(true);
    expect(rangesOverlap([3, 3], [3, 3])).toBe(true);
  });
});

describe('scoreEvalCase', () => {
  it('computes recall / precision / citation and passes a perfect case', () => {
    const s = scoreEvalCase({
      expected: [find('src/a.ts', 10)],
      kept: [f('src/a.ts', 10)],
      droppedCount: 1,
    });
    expect(s).toMatchObject({
      expected_find: 1,
      found: 1,
      kept: 1,
      noise: 0,
      dropped: 1,
      recall: 1,
      precision: 1,
      citation_accuracy: 0.5,
      pass: true,
    });
  });

  it('matches across a/ b/ prefixes, missing end_line and range overlap', () => {
    const s = scoreEvalCase({
      expected: [find('b/src/a.ts', 12)],
      kept: [f('src/a.ts', 10, 14)],
      droppedCount: 0,
    });
    expect(s.found).toBe(1);
    const miss = scoreEvalCase({
      expected: [find('src/a.ts', 12)],
      kept: [f('src/a.ts', 13, 14)],
      droppedCount: 0,
    });
    expect(miss.found).toBe(0);
    expect(miss.recall).toBe(0);
    expect(miss.pass).toBe(false);
  });

  it('returns null for every zero-denominator metric', () => {
    const s = scoreEvalCase({ expected: [], kept: [], droppedCount: 0 });
    expect(s.recall).toBeNull();
    expect(s.precision).toBeNull();
    expect(s.citation_accuracy).toBeNull();
    // only dropped candidates: citation defined (0), precision still null
    const d = scoreEvalCase({ expected: [], kept: [], droppedCount: 2 });
    expect(d.citation_accuracy).toBe(0);
    expect(d.precision).toBeNull();
  });

  it('empty expectation passes only when nothing survives', () => {
    expect(scoreEvalCase({ expected: [], kept: [], droppedCount: 0 }).pass).toBe(true);
    expect(scoreEvalCase({ expected: [], kept: [f('x.ts', 1)], droppedCount: 0 }).pass).toBe(
      false,
    );
  });

  it('only must_not_flag hits are noise; unexpected findings are not', () => {
    const s = scoreEvalCase({
      expected: [not('src/a.ts', 5)],
      kept: [f('src/a.ts', 5), f('src/other.ts', 1)],
      droppedCount: 0,
    });
    expect(s.noise).toBe(1);
    expect(s.precision).toBe(0.5);
    expect(s.pass).toBe(false);
    const clean = scoreEvalCase({
      expected: [not('src/a.ts', 5)],
      kept: [f('src/other.ts', 1)],
      droppedCount: 0,
    });
    expect(clean.noise).toBe(0);
    expect(clean.pass).toBe(true);
  });

  it('a contradictory finding counts as found AND noise', () => {
    const s = scoreEvalCase({
      expected: [find('src/a.ts', 5), not('src/a.ts', 5)],
      kept: [f('src/a.ts', 5)],
      droppedCount: 0,
    });
    expect(s.found).toBe(1);
    expect(s.noise).toBe(1);
    expect(s.pass).toBe(false);
  });

  it('two findings on one must_find count once for recall, both in the precision denominator', () => {
    const s = scoreEvalCase({
      expected: [find('src/a.ts', 5, 8)],
      kept: [f('src/a.ts', 5), f('src/a.ts', 8)],
      droppedCount: 0,
    });
    expect(s.found).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.kept).toBe(2);
    expect(s.precision).toBe(1);
  });

  it('is deterministic', () => {
    const input: ScoreEvalCaseInput = {
      expected: [find('a.ts', 1), not('b.ts', 2)],
      kept: [f('a.ts', 1), f('b.ts', 2)],
      droppedCount: 3,
    };
    expect(scoreEvalCase(input)).toEqual(scoreEvalCase(input));
  });
});

describe('aggregateEvalScores', () => {
  const mk = (
    name: string,
    input: ScoreEvalCaseInput,
    costUsd: number | null,
  ): ScoredEvalCase => ({
    name,
    expected: input.expected,
    actual: { n: name },
    score: scoreEvalCase(input),
    costUsd,
  });

  it('micro-averages over non-errored cases and excludes errored ones', () => {
    const a = mk(
      'a',
      { expected: [find('a.ts', 1), find('a.ts', 9)], kept: [f('a.ts', 1)], droppedCount: 1 },
      0.1,
    );
    const b = mk(
      'b',
      { expected: [find('b.ts', 1)], kept: [f('b.ts', 1), f('b.ts', 50)], droppedCount: 0 },
      0.2,
    );
    const errored: ScoredEvalCase = {
      name: 'boom',
      expected: [find('c.ts', 1)],
      actual: { error: 'x' },
      score: null,
      costUsd: null,
    };
    const agg = aggregateEvalScores([a, b, errored], 1234.4);
    expect(agg.erroredCount).toBe(1);
    expect(agg.run.traces_total).toBe(2);
    expect(agg.run.traces_passed).toBe(1); // b passes (found 1/1), a misses an item
    expect(agg.run.recall).toBeCloseTo(2 / 3);
    expect(agg.run.precision).toBe(1);
    expect(agg.run.citation_accuracy).toBeCloseTo(3 / 4);
    expect(agg.run.cost_usd).toBeCloseTo(0.3);
    expect(agg.run.duration_ms).toBe(1234);
    expect(agg.run.per_trace).toHaveLength(3);
    expect(agg.run.per_trace[2]).toMatchObject({ name: 'boom', pass: false });
    expect(agg.na).toEqual({ recall: false, precision: false, citation_accuracy: false });
  });

  it('cost is null when any non-errored case is unpriced', () => {
    const a = mk('a', { expected: [], kept: [], droppedCount: 0 }, 0.1);
    const b = mk('b', { expected: [], kept: [], droppedCount: 0 }, null);
    expect(aggregateEvalScores([a, b], 1).run.cost_usd).toBeNull();
  });

  it('fills vacuous 1 and flags n/a when a run-level denominator is zero', () => {
    const a = mk('clean', { expected: [], kept: [], droppedCount: 0 }, 0);
    const agg = aggregateEvalScores([a], 5);
    expect(agg.run.recall).toBe(1);
    expect(agg.run.precision).toBe(1);
    expect(agg.run.citation_accuracy).toBe(1);
    expect(agg.na).toEqual({ recall: true, precision: true, citation_accuracy: true });
    expect(agg.run.traces_passed).toBe(1);
  });

  it('is deterministic', () => {
    const a = mk('a', { expected: [find('a.ts', 1)], kept: [f('a.ts', 1)], droppedCount: 0 }, 0);
    expect(aggregateEvalScores([a], 10)).toEqual(aggregateEvalScores([a], 10));
  });
});

describe('zero-LLM proof', () => {
  it('scoring makes no LLM call and accepts no LLM provider', async () => {
    const fixture = {
      verdict: 'request_changes',
      summary: 's',
      score: 50,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 't',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'r',
          confidence: 0.9,
          kind: 'finding',
        },
      ],
    };
    // Inline counting stub: no import from any other package.
    const llm = {
      calls: 0,
      id: 'openai' as const,
      async listModels() {
        this.calls += 1;
        return [];
      },
      async complete() {
        this.calls += 1;
        return { text: '', model: 'm', tokensIn: 0, tokensOut: 0, costUsd: null };
      },
      async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        this.calls += 1;
        return {
          data: fixture as unknown as T,
          model: 'm',
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0.001,
          raw: JSON.stringify(fixture),
          attempts: 1,
        };
      },
      async embed() {
        this.calls += 1;
        return [];
      },
    } satisfies LLMProvider & { calls: number };
    const diff: UnifiedDiff = {
      raw: [
        'diff --git a/src/config.ts b/src/config.ts',
        '--- a/src/config.ts',
        '+++ b/src/config.ts',
        '@@ -10,3 +10,4 @@',
        '   port: 3000,',
        '+  stripeKey: "x",',
        '   redisUrl: x,',
      ].join('\n'),
      files: [
        {
          path: 'src/config.ts',
          additions: 1,
          deletions: 0,
          hunks: [
            { file: 'src/config.ts', oldStart: 10, oldLines: 3, newStart: 10, newLines: 4, newLineNumbers: [10, 11, 12, 13] },
          ],
        },
      ],
    };
    const outcome = await reviewPullRequest({ systemPrompt: 'sec', model: 'm', diff, llm });
    // The engine called the LLM; from here on, scoring must add nothing.
    expect(llm.calls).toBeGreaterThan(0);
    llm.calls = 0;

    const score = scoreEvalCase({
      expected: [find('src/config.ts', 11)],
      kept: outcome.review.findings,
      droppedCount: outcome.dropped.length,
    });
    aggregateEvalScores(
      [{ name: 'c', expected: [], actual: null, score, costUsd: outcome.costUsd }],
      1,
    );
    expect(llm.calls).toBe(0);
    expect(score.found).toBe(1);

    // Type-level: no signature can receive an LLM provider.
    expectTypeOf<LLMProvider>().not.toMatchTypeOf<ScoreEvalCaseInput>();
    expectTypeOf<LLMProvider>().not.toMatchTypeOf<Parameters<typeof aggregateEvalScores>[0]>();
  });
});
