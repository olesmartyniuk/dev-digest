import { describe, it, expect } from 'vitest';
import {
  applyConfidenceCeiling,
  detectReferences,
  extractHunkHeaders,
  renderIntentDigest,
  safeGitRef,
  safeRepoPath,
} from '../src/modules/intent/helpers.js';
import { MAX_REFERENCES } from '../src/modules/intent/constants.js';
import type { IntentSource } from '@devdigest/shared';
import type { PrIntentView } from '@devdigest/shared';

/**
 * Pure-function tests for the L03 intent classifier's reference detection,
 * path/ref safety guards, hunk-header extraction, confidence enforcement and
 * digest rendering — no DB, no LLM, no clone. These are the rules the plan
 * (`docs/plans/2026-09-27-l03-intent-layer.md`) says must NOT be improvised.
 */

const REPO = { owner: 'acme', name: 'payments-api' };

describe('detectReferences', () => {
  it('finds a plain repo-relative doc path in the body text', () => {
    const refs = detectReferences('See docs/plans/proposal.md for context.', REPO);
    expect(refs).toContainEqual({
      kind: 'plan',
      ref: 'docs/plans/proposal.md',
      target: { type: 'repo_path', path: 'docs/plans/proposal.md', ref: null },
    });
  });

  it('resolves a same-repo GitHub blob URL with a doc extension to a repo_path with its ref', () => {
    const refs = detectReferences(
      'See https://github.com/acme/payments-api/blob/main/docs/plans/proposal.md for details.',
      REPO,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      kind: 'plan',
      target: { type: 'repo_path', path: 'docs/plans/proposal.md', ref: 'main' },
    });
  });

  it('flags a blob URL in a DIFFERENT repository as external — never read', () => {
    const refs = detectReferences(
      'See https://github.com/other-org/other-repo/blob/main/docs/x.md for details.',
      REPO,
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.target).toEqual({
      type: 'external',
      reason: 'links to a different repository — only this repo is readable',
    });
  });

  it.each([
    ['https://www.notion.so/workspace/Some-Spec-abc123'],
    ['https://acme.atlassian.net/wiki/spaces/ENG/pages/123/Design'],
    ['https://docs.google.com/document/d/abc123/edit'],
  ])('flags a %s reference as external — never fetched', (url) => {
    const refs = detectReferences(`Spec: ${url}`, REPO);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]!.target.type).toBe('external');
  });

  it('resolves "Jira: ABC-123" to an external linked_issue, but never mistakes "UTF-8" for one', () => {
    const withJira = detectReferences('Jira: ABC-123 tracks this change.', REPO);
    expect(withJira).toContainEqual({
      kind: 'linked_issue',
      ref: 'ABC-123',
      target: { type: 'external', reason: 'external ticket key — tracker not reachable from this tool' },
    });

    const withUtf8 = detectReferences('All text in this repo is encoded as UTF-8.', REPO);
    expect(withUtf8.filter((r) => r.kind === 'linked_issue')).toEqual([]);
  });

  it('ignores a badge/image URL (no doc extension, no external-doc signal)', () => {
    const refs = detectReferences(
      '![Build Status](https://img.shields.io/badge/build-passing-green.svg)',
      REPO,
    );
    expect(refs).toEqual([]);
  });

  it(`caps the result at MAX_REFERENCES (${MAX_REFERENCES})`, () => {
    const paths = Array.from({ length: MAX_REFERENCES + 1 }, (_, i) => `docs/plans/${String.fromCharCode(97 + i)}.md`);
    const refs = detectReferences(paths.join(' '), REPO);
    expect(refs).toHaveLength(MAX_REFERENCES);
    expect(refs[0]!.ref).toBe('docs/plans/a.md');
    expect(refs.some((r) => r.ref === paths[MAX_REFERENCES])).toBe(false);
  });
});

describe('safeRepoPath', () => {
  it.each([
    ['../x.md', 'parent-directory segment'],
    ['/etc/x.md', 'absolute path'],
    ['C:/x.md', 'Windows drive prefix'],
    ['a\\b.md', 'backslash'],
    ['docs/./x.md', 'current-directory segment'],
    ['docs/x.ts', 'non-doc extension'],
  ])('rejects %s (%s)', (input) => {
    expect(safeRepoPath(input)).toBeNull();
  });

  it('accepts a plain repo-relative doc path', () => {
    expect(safeRepoPath('docs/plans/x.md')).toBe('docs/plans/x.md');
  });
});

describe('safeGitRef', () => {
  it.each([
    ['-x', 'looks like a CLI flag'],
    ['a..b', 'contains a range operator'],
  ])('rejects %s (%s)', (input) => {
    expect(safeGitRef(input)).toBeNull();
  });

  it('accepts a full-length commit sha and a plain branch name', () => {
    expect(safeGitRef('a1b2c3d')).toBe('a1b2c3d');
    expect(safeGitRef('main')).toBe('main');
  });
});

describe('extractHunkHeaders', () => {
  it('keeps ONLY @@ header lines — every +/-/context body line is dropped', () => {
    const raw = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,4 @@ function foo() {',
      ' context line',
      '-removed line',
      '+added line',
      ' another context',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -10,2 +10,3 @@',
      '+add',
    ].join('\n');

    const headers = extractHunkHeaders(raw);
    expect(headers.get('src/a.ts')).toEqual(['@@ -1,3 +1,4 @@ function foo() {']);
    expect(headers.get('src/b.ts')).toEqual(['@@ -10,2 +10,3 @@']);

    const all = [...headers.values()].flat();
    for (const line of all) {
      expect(line.startsWith('+')).toBe(false);
      expect(line.startsWith('-')).toBe(false);
      expect(line.startsWith(' ')).toBe(false);
    }
  });
});

describe('applyConfidenceCeiling', () => {
  it('forces low when the description is empty, regardless of the model level', () => {
    const { confidence, reason } = applyConfidenceCeiling(
      'high',
      { descriptionEmpty: true, unavailable: [] },
      'Author explained clearly.',
    );
    expect(confidence).toBe('low');
    expect(reason).toContain('No PR description');
  });

  it('caps at medium when any reference is unavailable, even if the model said high', () => {
    const unavailable: IntentSource[] = [
      { kind: 'plan', ref: 'docs/x.md', status: 'unavailable', note: 'not found' },
    ];
    const { confidence, reason } = applyConfidenceCeiling(
      'high',
      { descriptionEmpty: false, unavailable },
      'Clear intent stated.',
    );
    expect(confidence).toBe('medium');
    expect(reason).toContain('Referenced context missing: docs/x.md');
  });

  it('never raises the model — a model-reported low stays low even with no ceiling pressure', () => {
    const { confidence } = applyConfidenceCeiling(
      'low',
      { descriptionEmpty: false, unavailable: [] },
      'Model was unsure.',
    );
    expect(confidence).toBe('low');
  });
});

describe('renderIntentDigest', () => {
  function view(over: Partial<PrIntentView> = {}): PrIntentView {
    return {
      intent: 'Add rate limiting.',
      in_scope: ['rate limiting middleware'],
      out_of_scope: [],
      pr_id: 'pr1',
      confidence: 'medium',
      confidence_reason: 'Some things could not be read.',
      sources: [],
      provider: 'openrouter',
      model: 'anthropic/claude-haiku-4.5',
      head_sha: 'deadbeef1234567',
      stale: false,
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      classified_at: '2026-09-27T00:00:00.000Z',
      ...over,
    };
  }

  it('renders the stale warning line when the PR head has moved since classification', () => {
    const digest = renderIntentDigest(view({ stale: true }));
    expect(digest).toContain(
      'Classified against commit deadbee — the PR has changed since; treat scope as approximate',
    );
  });

  it('omits the stale suffix when not stale, and renders a "Missing context" line for unavailable sources', () => {
    const digest = renderIntentDigest(
      view({
        stale: false,
        sources: [
          { kind: 'plan', ref: 'docs/spec.md', status: 'unavailable', note: 'not found' },
          { kind: 'title', ref: null, status: 'used', note: null },
        ],
      }),
    );
    expect(digest).toContain('Classified against commit deadbee');
    expect(digest).not.toContain('treat scope as approximate');
    expect(digest).toContain('Missing context (NOT read — do not assume its content): docs/spec.md');
  });

  it('falls back to "(none stated)" for empty in/out-of-scope lists', () => {
    const digest = renderIntentDigest(view({ in_scope: [], out_of_scope: [] }));
    expect(digest).toContain('In scope:\n- (none stated)');
    expect(digest).toContain('Out of scope:\n- (none stated)');
  });
});
