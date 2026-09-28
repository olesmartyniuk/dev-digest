import { describe, it, expect } from 'vitest';
import {
  buildSkillBody,
  findSnippetLine,
  normalizeRule,
  renderSample,
  skillNameFor,
  slugifyRule,
  toConventionDto,
  truncateSample,
  verifyCandidates,
} from '../src/modules/conventions/helpers.js';
import { detectConfigConventions, findLine } from '../src/modules/conventions/config-rules.js';
import type { CandidateConvention, SampleFile } from '../src/modules/conventions/types.js';
import type { Convention } from '@devdigest/shared';

/**
 * The evidence gate is the whole point of the Conventions Extractor: it is what
 * turns "the model said so" into "this is demonstrably true of this repo".
 * These are pure-string tests — no DB, no LLM, no clone.
 */

const FILE_CONTENT = [
  'import { db } from "../db";',
  '',
  'export async function loadUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

const sample: SampleFile = {
  path: 'src/api/users.ts',
  content: FILE_CONTENT,
  lineCount: 7,
  truncated: false,
};

function candidate(over: Partial<CandidateConvention> = {}): CandidateConvention {
  return {
    category: 'async',
    rule: 'Always use async/await instead of .then() chains.',
    rationale: 'Keeps control flow linear.',
    evidencePath: 'src/api/users.ts',
    evidenceLine: 4,
    evidenceSnippet: '  const user = await db.users.find(id);',
    confidence: 0.9,
    origin: 'model',
    ...over,
  };
}

describe('normalizeRule', () => {
  it('collapses punctuation and case so re-phrasings share one dedupe key', () => {
    expect(normalizeRule('Always use async/await instead of .then() chains.')).toBe(
      normalizeRule('always use async await   instead of then chains'),
    );
  });
});

describe('slugifyRule', () => {
  it('produces a short kebab-case anchor', () => {
    expect(slugifyRule('Always use async/await instead of .then() chains.')).toBe(
      'always-use-async-await-instead-of',
    );
  });
});

describe('renderSample', () => {
  it('prefixes every line with its 1-based number', () => {
    const rendered = renderSample(sample);
    expect(rendered).toContain('=== FILE: src/api/users.ts ===');
    expect(rendered).toContain('   4 |   const user = await db.users.find(id);');
  });
});

describe('truncateSample', () => {
  it('caps line count and reports the truncation', () => {
    const raw = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const out = truncateSample('a.ts', raw, 10, 10_000);
    expect(out.lineCount).toBe(10);
    expect(out.truncated).toBe(true);
  });

  it('leaves a small file untouched', () => {
    const out = truncateSample('a.ts', 'one\ntwo', 10, 10_000);
    expect(out).toMatchObject({ lineCount: 2, truncated: false, content: 'one\ntwo' });
  });
});

describe('findSnippetLine', () => {
  const lines = FILE_CONTENT.split('\n');

  it('accepts a snippet that sits at the claimed line', () => {
    expect(findSnippetLine(lines, '  const user = await db.users.find(id);', 4)).toEqual({
      line: 4,
      corrected: false,
    });
  });

  it('ignores indentation differences', () => {
    expect(findSnippetLine(lines, 'const user = await db.users.find(id);', 4)?.corrected).toBe(
      false,
    );
  });

  it('CORRECTS a wrong line number rather than dropping a real snippet', () => {
    expect(findSnippetLine(lines, 'const posts = await db.posts.findMany({ userId: id });', 2)).toEqual(
      { line: 5, corrected: true },
    );
  });

  it('returns null for a snippet that appears nowhere', () => {
    expect(findSnippetLine(lines, 'const total = computeTotals(order);', 4)).toBeNull();
  });
});

describe('verifyCandidates', () => {
  it('keeps a candidate whose evidence checks out', () => {
    const { kept, dropped } = verifyCandidates([candidate()], [sample]);
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ evidenceLine: 4, lineCorrected: false });
  });

  it('replaces the proposed snippet with the real text at the verified line', () => {
    const { kept } = verifyCandidates(
      [candidate({ evidenceSnippet: 'const user = await db.users.find(id)' })],
      [sample],
    );
    expect(kept[0]!.evidenceSnippet).toBe('  const user = await db.users.find(id);');
  });

  it('drops a candidate citing a file that was never sampled', () => {
    const { kept, dropped } = verifyCandidates(
      [candidate({ evidencePath: 'src/does/not/exist.ts' })],
      [sample],
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toMatchObject({ reason: 'file_not_sampled' });
  });

  it('drops a hallucinated snippet', () => {
    const { kept, dropped } = verifyCandidates(
      [candidate({ evidenceSnippet: 'await stripe.charges.create(payload);' })],
      [sample],
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toMatchObject({ reason: 'snippet_not_found' });
  });

  it('drops a low-confidence candidate', () => {
    const { dropped } = verifyCandidates([candidate({ confidence: 0.2 })], [sample]);
    expect(dropped[0]).toMatchObject({ reason: 'low_confidence' });
  });

  it('drops a duplicate rule within one extraction', () => {
    const { kept, dropped } = verifyCandidates(
      [candidate(), candidate({ evidenceLine: 5, evidenceSnippet: 'const posts = await db.posts.findMany({ userId: id });' })],
      [sample],
    );
    expect(kept).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ reason: 'duplicate' });
  });

  it('skips a rule the user has already accepted or rejected', () => {
    const judged = new Set([normalizeRule(candidate().rule)]);
    const { kept, dropped } = verifyCandidates([candidate()], [sample], judged);
    expect(kept).toEqual([]);
    expect(dropped[0]).toMatchObject({ reason: 'already_judged' });
  });

  it('reports every drop — nothing disappears silently', () => {
    const { dropped } = verifyCandidates(
      [
        candidate({ rule: 'A rule', confidence: 0.1 }),
        candidate({ rule: 'B rule', evidencePath: 'nope.ts' }),
        candidate({ rule: 'C rule', evidenceSnippet: 'nothing like this' }),
      ],
      [sample],
    );
    expect(dropped.map((d) => d.reason)).toEqual([
      'low_confidence',
      'file_not_sampled',
      'snippet_not_found',
    ]);
  });
});

describe('config pass', () => {
  it('finds the line a config option is declared on', () => {
    const hit = findLine('{\n  "compilerOptions": {\n    "strict": true\n  }\n}', /"strict"\s*:\s*true/);
    expect(hit).toEqual({ line: 3, text: '"strict": true' });
  });

  it('derives tsconfig conventions with exact evidence', () => {
    const tsconfig: SampleFile = {
      path: 'tsconfig.json',
      content: '{\n  "compilerOptions": {\n    "strict": true,\n    "noUncheckedIndexedAccess": true\n  }\n}',
      lineCount: 6,
      truncated: false,
    };
    const found = detectConfigConventions([tsconfig]);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ origin: 'config', evidencePath: 'tsconfig.json', evidenceLine: 3 });
  });

  it('config-derived candidates pass the same evidence gate as the model’s', () => {
    const eslint: SampleFile = {
      path: '.eslintrc.json',
      content: '{\n  "rules": {\n    "no-console": "error"\n  }\n}',
      lineCount: 5,
      truncated: false,
    };
    const { kept, dropped } = verifyCandidates(detectConfigConventions([eslint]), [eslint]);
    expect(dropped).toEqual([]);
    expect(kept[0]).toMatchObject({ category: 'logging', evidenceLine: 3 });
  });

  it('says nothing about a config option the repo did not set', () => {
    const tsconfig: SampleFile = {
      path: 'tsconfig.json',
      content: '{\n  "compilerOptions": {\n    "strict": false\n  }\n}',
      lineCount: 4,
      truncated: false,
    };
    expect(detectConfigConventions([tsconfig])).toEqual([]);
  });
});

describe('toConventionDto', () => {
  it('maps a persisted row to the public DTO', () => {
    expect(
      toConventionDto({
        id: 'c1',
        repoId: 'r1',
        category: 'async',
        rule: 'Use async/await.',
        rationale: null,
        evidencePath: 'src/a.ts',
        evidenceLine: 12,
        evidenceSnippet: 'await go();',
        confidence: 0.8,
        status: 'pending',
        origin: 'model',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toEqual({
      id: 'c1',
      repo_id: 'r1',
      category: 'async',
      rule: 'Use async/await.',
      rationale: null,
      evidence: { path: 'src/a.ts', line: 12, snippet: 'await go();' },
      confidence: 0.8,
      status: 'pending',
      origin: 'model',
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('buildSkillBody', () => {
  const accepted: Convention[] = [
    {
      id: 'c1',
      repo_id: 'r1',
      category: 'async',
      rule: 'Always use async/await instead of .then() chains.',
      rationale: 'Keeps control flow linear.',
      evidence: { path: 'src/api/users.ts', line: 23, snippet: 'const user = await db.users.find(id);' },
      confidence: 0.91,
      status: 'accepted',
      origin: 'model',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'c2',
      repo_id: 'r1',
      category: 'api',
      rule: 'All public route handlers return typed Result<T, ApiError>.',
      rationale: null,
      evidence: { path: 'src/api/public/index.ts', line: 14, snippet: 'function handler(): Result<Item[], ApiError> {' },
      confidence: 0.78,
      status: 'accepted',
      origin: 'model',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('names the skill after the repo', () => {
    expect(skillNameFor('acme/payments-api')).toBe('payments-api-conventions');
  });

  it('renders one section per rule, each carrying its verified file:line', () => {
    const body = buildSkillBody('acme/payments-api', accepted);
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('## Async');
    expect(body).toContain('### always-use-async-await-instead-of');
    expect(body).toContain('Detected in `src/api/users.ts:23`:');
    expect(body).toContain('const user = await db.users.find(id);');
    expect(body).toContain('## API');
  });

  it('groups by category rather than interleaving', () => {
    const body = buildSkillBody('acme/payments-api', accepted);
    expect(body.indexOf('## Async')).toBeLessThan(body.indexOf('## API'));
  });

  it('still produces a valid body when nothing is accepted', () => {
    const body = buildSkillBody('acme/payments-api', []);
    expect(body).toContain('# payments-api-conventions');
    expect(body).not.toContain('###');
  });
});
