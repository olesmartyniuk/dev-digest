import { describe, it, expect } from 'vitest';
import { CiRunResult } from '@devdigest/shared';
import {
  artifactPrefixFor,
  runKey,
  runKeyFromArtifactName,
  slugify,
  uniqueSlug,
} from '../src/modules/ci/helpers.js';

const validResult = (over: Record<string, unknown> = {}) => ({
  findings_count: 1,
  cost_usd: null,
  agent: 'Security Reviewer',
  status: 'succeeded',
  blockers: 0,
  agent_slug: 'security-reviewer',
  repository: 'acme/app',
  job_url: 'https://github.com/acme/app/actions/runs/9/attempts/1',
  github_run_id: 9,
  github_run_attempt: 1,
  model: 'deepseek/deepseek-v4-flash',
  manifest_version: null,
  commit_sha: null,
  dependencies: { skills: [], runner_version: '0.1.0', reviewer_core_version: '0.0.0' },
  finished_at: '2026-10-15T10:00:00.000Z',
  ...over,
});

describe('ci artifact-name helpers', () => {
  it('parses `<run_id>-<attempt>` only for the exact prefix and a strictly numeric tail', () => {
    const prefix = artifactPrefixFor('sec');
    expect(prefix).toBe('devdigest-result-sec-');
    expect(runKeyFromArtifactName(`${prefix}123-2`, prefix)).toBe('123-2');
    // Another agent's artifact, extra segments, non-numeric tails must never match.
    expect(runKeyFromArtifactName('devdigest-result-other-123-2', prefix)).toBeNull();
    expect(runKeyFromArtifactName(`${prefix}123-2-3`, prefix)).toBeNull();
    expect(runKeyFromArtifactName(`${prefix}12a-2`, prefix)).toBeNull();
    expect(runKeyFromArtifactName(`${prefix}123`, prefix)).toBeNull();
    // The run key of a parsed result must equal the key parsed from its artifact name.
    expect(runKey({ github_run_id: 123, github_run_attempt: 2 })).toBe('123-2');
  });

  it('slugify output is always a valid slug; uniqueSlug suffix is stable and dash-free', () => {
    expect(slugify('  --Foo__Bar--  ')).toBe('foo-bar');
    expect(slugify('')).toBe('agent');
    expect(slugify('a/b; rm -rf')).toBe('a-b-rm-rf');
    expect(uniqueSlug('x', '12345678-aaaa', new Set(['x']))).toBe('x-123456');
    expect(uniqueSlug('x', '12345678-aaaa', new Set(['x']))).toBe(
      uniqueSlug('x', '12345678-aaaa', new Set(['x', 'y'])),
    );
  });
});

describe('CiRunResult schema', () => {
  it('accepts a complete result including nullish optional fields', () => {
    expect(CiRunResult.safeParse(validResult()).success).toBe(true);
    expect(
      CiRunResult.safeParse(validResult({ error: null, tokens_in: null, pr_number: null })).success,
    ).toBe(true);
  });

  it.each([
    ['non-github job_url', { job_url: 'https://evil.example/actions/runs/9' }],
    ['non-https github job_url', { job_url: 'http://github.com/acme/app/actions/runs/9' }],
    ['slug with a path separator', { agent_slug: '../x' }],
    ['uppercase slug', { agent_slug: 'Security' }],
    ['repository with shell metacharacters', { repository: 'acme/app;rm' }],
    ['repository without owner', { repository: 'app' }],
    ['short commit sha', { commit_sha: 'abc123' }],
    ['uppercase commit sha', { commit_sha: 'B'.repeat(40) }],
    ['zero run id', { github_run_id: 0 }],
    ['fractional attempt', { github_run_attempt: 1.5 }],
    ['negative blockers', { blockers: -1 }],
    ['running status (never ingested)', { status: 'running' }],
    ['non-ISO finished_at', { finished_at: 'yesterday' }],
    ['oversized error', { error: 'x'.repeat(2001) }],
    ['empty model', { model: '' }],
  ])('rejects %s', (_label, over) => {
    expect(CiRunResult.safeParse(validResult(over)).success).toBe(false);
  });
});
