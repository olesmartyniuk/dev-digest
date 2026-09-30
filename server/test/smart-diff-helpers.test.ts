import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, classifyPath } from '../src/modules/smart-diff/helpers.js';

/**
 * Pure-function tests for the L03 Smart Diff classifier + builder — no DB, no
 * LLM. These are the rules the plan (`docs/plans/2026-09-28-l03-smart-diff.md`)
 * says must NOT be improvised, including the required edge cases where rule
 * order (not intuition) decides the role.
 */

describe('classifyPath', () => {
  it.each([
    ['pnpm-lock.yaml', 'boilerplate'],
    ['server/package-lock.json', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['dist/index.js', 'boilerplate'],
    ['build/out.css', 'boilerplate'],
    ['src/__snapshots__/a.test.ts.snap', 'boilerplate'],
    ['api.generated.ts', 'boilerplate'],
    ['vendor/jquery.min.js', 'boilerplate'],
    // REQUIRED edge case: rule 1 (*.snap) is checked before rule 2
    // (__tests__/**), so the snapshot rule outranks tests.
    ['__tests__/x.snap', 'boilerplate'],

    ['server/src/a.test.ts', 'tests'],
    ['client/src/A.test.tsx', 'tests'],
    ['server/test/intent.it.test.ts', 'tests'],
    ['lib/x.spec.ts', 'tests'],
    ['server/test/helpers/pg.ts', 'tests'],
    ['pkg/tests/util.ts', 'tests'],
    ['src/__tests__/util.ts', 'tests'],
    ['test/index.ts', 'tests'],
    ['e2e/run.ts', 'tests'],
    // REQUIRED edge case, recorded decision: e2e/** (rule 2) matches before
    // docs' **/*.md (rule 4) is ever evaluated; an e2e README documents the
    // flow harness, so it stays with the flows.
    ['e2e/README.md', 'tests'],

    ['server/src/modules/index.ts', 'wiring'],
    ['client/vitest.config.ts', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['.eslintrc.cjs', 'wiring'],
    ['.env.example', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    // REQUIRED edge case: .claude/** (rule 3) is checked before **/*.md
    // (rule 4); markdown here configures agent behaviour, it is not prose docs.
    ['.claude/skills/security/SKILL.md', 'wiring'],
    ['docs/index.ts', 'wiring'],

    ['docs/architecture.md', 'docs'],
    ['docs/diagram.png', 'docs'],
    ['README', 'docs'],
    ['CHANGELOG.txt', 'docs'],
    ['LICENSE', 'docs'],

    ['src/config.ts', 'core'],
    ['server/src/modules/smart-diff/helpers.ts', 'core'],

    ['server\\src\\a.test.ts', 'tests'],
  ] as const)('%s → %s', (path, role) => {
    expect(classifyPath(path)).toBe(role);
  });
});

describe('buildSmartDiff', () => {
  it('groups a mixed input, in ROLE_ORDER, omitting empty roles', () => {
    const d = buildSmartDiff([
      { path: 'client/vitest.config.ts', additions: 10, deletions: 2 }, // wiring
      { path: 'src/app.ts', additions: 0, deletions: 5 }, // core
      { path: 'pnpm-lock.yaml', additions: 300, deletions: 0 }, // boilerplate
      { path: 'src/other.ts', additions: 1, deletions: 1 }, // core
    ]);

    expect(d.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
  });

  it('sorts files within a group by path', () => {
    const d = buildSmartDiff([
      { path: 'src/z.ts', additions: 1, deletions: 0 },
      { path: 'src/a.ts', additions: 1, deletions: 0 },
      { path: 'src/m.ts', additions: 1, deletions: 0 },
    ]);
    expect(d.groups[0]!.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/m.ts', 'src/z.ts']);
  });

  it('computes total_lines as the sum of additions+deletions', () => {
    const d = buildSmartDiff([
      { path: 'a.ts', additions: 10, deletions: 2 },
      { path: 'b.ts', additions: 0, deletions: 5 },
      { path: 'c.ts', additions: 300, deletions: 0 },
    ]);
    expect(d.split_suggestion.total_lines).toBe(317);
  });

  it('never suggests a split and never summarizes pseudocode', () => {
    const d = buildSmartDiff([{ path: 'a.ts', additions: 5, deletions: 0 }]);
    expect(d.split_suggestion.too_big).toBe(false);
    expect(d.split_suggestion.proposed_splits).toEqual([]);
    for (const g of d.groups) {
      for (const f of g.files) {
        expect(f.finding_lines).toEqual([]);
        expect(f.pseudocode_summary).toBeNull();
      }
    }
  });

  it('returns an empty response for no files', () => {
    const d = buildSmartDiff([]);
    expect(d.groups).toEqual([]);
    expect(d.split_suggestion.total_lines).toBe(0);
  });

  it('conforms to the SmartDiff contract', () => {
    const d = buildSmartDiff([
      { path: 'README.md', additions: 1, deletions: 0 },
      { path: 'src/a.test.ts', additions: 2, deletions: 0 },
    ]);
    expect(() => SmartDiff.parse(d)).not.toThrow();
  });
});
