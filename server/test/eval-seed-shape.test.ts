import { describe, it, expect } from 'vitest';
import { EvalExpectation, type Finding } from '@devdigest/shared';
import { groundFindings } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { SECURITY_REVIEWER_EVAL_CASES } from '../src/db/seed-evals.js';

/** Hermetic shape checks for the seeded Security Reviewer eval set (AC-9, D6). */
describe('SECURITY_REVIEWER_EVAL_CASES', () => {
  const cases = SECURITY_REVIEWER_EVAL_CASES;

  it('ships >= 8 cases with unique names and the required kind mix', () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
    const items = cases.flatMap((c) => c.expected_output);
    expect(items.filter((i) => i.kind === 'must_find').length).toBeGreaterThanOrEqual(3);
    expect(items.filter((i) => i.kind === 'must_not_flag').length).toBeGreaterThanOrEqual(3);
    expect(cases.some((c) => c.expected_output.length === 0)).toBe(true);
    expect(cases.every((c) => c.input_meta.origin === 'seed')).toBe(true);
  });

  it('matches the seeded finding location (src/config.ts:12)', () => {
    const stripe = cases.find((c) => c.name === 'stripe-key-leak')!;
    expect(stripe.expected_output[0]).toMatchObject({
      kind: 'must_find',
      file: 'src/config.ts',
      start_line: 12,
    });
  });

  it('every expectation parses and every diff parses with >= 1 file', () => {
    for (const c of cases) {
      expect(() => EvalExpectation.parse(c.expected_output), c.name).not.toThrow();
      const diff = parseUnifiedDiff(c.input_diff);
      expect(diff.files.length, c.name).toBeGreaterThanOrEqual(1);
    }
  });

  it('every expectation is satisfiable: a finding at its range survives the grounding gate', () => {
    for (const c of cases) {
      const diff = parseUnifiedDiff(c.input_diff);
      for (const item of c.expected_output) {
        const finding: Finding = {
          id: 'x',
          severity: 'WARNING',
          category: 'security',
          title: 'probe',
          file: item.file,
          start_line: item.start_line,
          end_line: item.end_line ?? item.start_line,
          rationale: 'probe',
          confidence: 0.9,
          kind: 'finding',
        } as Finding;
        const { kept } = groundFindings([finding], diff);
        expect(kept, `${c.name}:${item.start_line}`).toHaveLength(1);
      }
    }
  });

  it('contains no realistic-looking key material', () => {
    const all = JSON.stringify(cases);
    for (const m of all.matchAll(/sk_live_[A-Za-z0-9_]{10,}/g)) {
      expect(m[0]).toContain('EXAMPLE');
    }
  });
});
