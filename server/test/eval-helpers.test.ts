import { describe, it, expect } from 'vitest';
import {
  buildAgentDashboard,
  caseNameFromFinding,
  decisionOf,
  extractFileFragment,
  summarizeExpectation,
  validateCaseAgainstDiff,
  type BatchRowLike,
} from '../src/modules/eval/helpers.js';
import { parseFrozenDiff } from '../src/modules/eval/frozen-diff.js';

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,1 +1,2 @@',
  ' keep',
  '+added a',
  'diff --git a/src/b.ts b/src/b.ts',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -1,1 +1,2 @@',
  ' keep',
  '+added b',
  '',
].join('\n');

describe('extractFileFragment', () => {
  it('returns only the block of the requested file, with a/ b/ prefix tolerance', () => {
    const frag = extractFileFragment(RAW, 'src/b.ts');
    expect(frag).toContain('+++ b/src/b.ts');
    expect(frag).toContain('+added b');
    expect(frag).not.toContain('src/a.ts');
    expect(extractFileFragment(RAW, 'b/src/a.ts')).toContain('+added a');
  });
  it('returns null when the file is absent', () => {
    expect(extractFileFragment(RAW, 'src/missing.ts')).toBeNull();
  });
});

describe('decisionOf / caseNameFromFinding / summarizeExpectation', () => {
  it('maps decisions and lets the later timestamp win', () => {
    const t1 = new Date('2026-01-01');
    const t2 = new Date('2026-01-02');
    expect(decisionOf({ acceptedAt: null, dismissedAt: null })).toBeNull();
    expect(decisionOf({ acceptedAt: t1, dismissedAt: null })).toBe('accepted');
    expect(decisionOf({ acceptedAt: null, dismissedAt: t1 })).toBe('dismissed');
    expect(decisionOf({ acceptedAt: t1, dismissedAt: t2 })).toBe('dismissed');
    expect(decisionOf({ acceptedAt: t2, dismissedAt: t1 })).toBe('accepted');
  });

  it('slugs the title and appends the id prefix within the length cap', () => {
    const name = caseNameFromFinding('Hardcoded Stripe secret key!', 'abcdef12-0000');
    expect(name).toBe('hardcoded-stripe-secret-key-abcdef');
    expect(caseNameFromFinding('x'.repeat(200), 'abcdef12').length).toBeLessThanOrEqual(60);
    expect(caseNameFromFinding('!!!', 'abcdef12')).toBe('finding-abcdef');
  });

  it('summarizes expectations incl. the empty case', () => {
    expect(summarizeExpectation([])).toEqual({
      items: 0,
      must_find: 0,
      must_not_flag: 0,
      chip: null,
    });
    expect(
      summarizeExpectation([
        { kind: 'must_find', file: 'a', start_line: 1, severity: 'CRITICAL', category: 'security' },
        { kind: 'must_not_flag', file: 'b', start_line: 2 },
      ]),
    ).toEqual({ items: 2, must_find: 1, must_not_flag: 1, chip: 'CRITICAL·security' });
  });
});

describe('validateCaseAgainstDiff / parseFrozenDiff', () => {
  it('flags expectations pointing at files not in the diff', () => {
    const issues = validateCaseAgainstDiff(
      [
        { kind: 'must_find', file: 'src/a.ts', start_line: 2 },
        { kind: 'must_find', file: 'src/nope.ts', start_line: 2 },
      ],
      ['src/a.ts'],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('src/nope.ts');
  });

  it('rejects text that is not a unified diff', () => {
    expect(() => parseFrozenDiff('just some text')).toThrow(/valid unified diff/);
    expect(parseFrozenDiff(RAW).files).toHaveLength(2);
  });
});

describe('buildAgentDashboard', () => {
  let n = 0;
  const batch = (
    over: Partial<BatchRowLike> & { recall?: number; precision?: number; citation?: number },
  ): BatchRowLike => {
    n += 1;
    const { recall = 1, precision = 1, citation = 1, ...rest } = over;
    return {
      id: `b${n}`,
      agentId: 'ag',
      agentVersion: 1,
      configJson: {},
      status: 'done',
      partial: false,
      caseIds: [],
      startedAt: new Date(2026, 0, n),
      finishedAt: new Date(2026, 0, n),
      aggregate: {
        recall,
        precision,
        citation_accuracy: citation,
        traces_passed: 3,
        traces_total: 4,
        duration_ms: 1,
        cost_usd: 0.1,
        per_trace: [],
      },
      na: null,
      costUsd: 0.1,
      erroredCount: 0,
      error: null,
      ...rest,
    };
  };

  it('no runs -> zeros, empty trend, no alert', () => {
    const { dashboard, regression } = buildAgentDashboard('ag', 5, [], []);
    expect(dashboard.cases_total).toBe(5);
    expect(dashboard.current.traces_total).toBe(0);
    expect(dashboard.trend).toEqual([]);
    expect(dashboard.alert).toBeNull();
    expect(regression).toBeNull();
  });

  it('a single run -> delta 0', () => {
    const { dashboard } = buildAgentDashboard('ag', 4, [batch({ recall: 0.5 })], []);
    expect(dashboard.current.recall).toBe(0.5);
    expect(dashboard.delta).toEqual({ recall: 0, precision: 0, citation_accuracy: 0 });
    expect(dashboard.trend).toHaveLength(1);
  });

  it('fires the regression alert at exactly 0.02, not at 0.019', () => {
    const older = batch({ agentVersion: 1, precision: 0.82 });
    const exact = batch({ agentVersion: 2, precision: 0.8 });
    const hit = buildAgentDashboard('ag', 4, [exact, older], []);
    expect(hit.regression).toMatchObject({ metric: 'precision', version: 2, previous_version: 1 });
    expect(hit.dashboard.alert).toBe('Precision dropped 2.0 pts in v2 vs v1');

    const below = batch({ agentVersion: 2, precision: 0.801 });
    expect(buildAgentDashboard('ag', 4, [below, older], []).regression).toBeNull();
  });

  it('picks the largest drop and excludes partial / failed runs everywhere', () => {
    const base = batch({ agentVersion: 1, recall: 1, precision: 1 });
    const partial = batch({ agentVersion: 2, partial: true, recall: 0 });
    const failed = batch({ agentVersion: 2, status: 'failed', aggregate: null });
    const latest = batch({ agentVersion: 3, recall: 0.9, precision: 0.7 });
    const { dashboard, regression } = buildAgentDashboard('ag', 4, [latest, failed, partial, base], []);
    expect(regression?.metric).toBe('precision');
    expect(regression?.previous_version).toBe(1);
    expect(dashboard.trend).toHaveLength(2); // base + latest only, chronological
    expect(dashboard.trend[0]!.recall).toBe(1);
    expect(dashboard.delta.precision).toBeCloseTo(-0.3);
    expect(dashboard.current.traces_passed).toBe(3);
  });
});
