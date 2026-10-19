import { describe, it, expect, vi } from 'vitest';
import { stringify } from 'yaml';
import { CiRunResult } from '@devdigest/shared';
import type { GitHubReviewPayload } from '@devdigest/shared';
import { MockLLMProvider } from '../../server/src/adapters/mocks.js';
import { runAgent, type RunnerDeps } from '../src/run.js';
import { loadManifest } from '../src/manifest.js';

const SHA = 'a'.repeat(40);
const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
  '',
].join('\n');

const REVIEW = {
  verdict: 'request_changes',
  summary: 'secret committed',
  score: 30,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'sk_live in diff',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

const MANIFEST_PATH = '.devdigest/agents/sec.yaml';
const manifestYaml = (over: Record<string, unknown> = {}) =>
  stringify({
    name: 'Security Reviewer',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    version: 3,
    strategy: 'auto',
    ci_fail_on: 'critical',
    skills: ['owasp'],
    system_prompt: 'You review security: really.',
    ...over,
  });

function setup(opts: {
  manifest?: string | null;
  failOn?: string;
  postAs?: 'github_review' | 'pr_comment' | 'none';
  key?: string | undefined;
  headRepo?: string;
  review?: unknown;
  postReviewThrows?: boolean;
} = {}) {
  const reviews: { payload: GitHubReviewPayload; commit: string }[] = [];
  const comments: string[] = [];
  const logs: string[] = [];
  const makeLlm = vi.fn(() => new MockLLMProvider('openai', { structured: opts.review ?? REVIEW }));
  const files: Record<string, string> = {
    'event.json': JSON.stringify({
      pull_request: { number: 7, head: { repo: { full_name: opts.headRepo ?? 'acme/app' } } },
    }),
    [MANIFEST_PATH]:
      opts.manifest === undefined
        ? manifestYaml(opts.failOn ? { ci_fail_on: opts.failOn } : {})
        : (opts.manifest as string),
    '.devdigest/skills/owasp.md': '# OWASP skill',
    '.devdigest/memory.jsonl': '',
  };
  if (opts.manifest === null) delete files[MANIFEST_PATH];
  const deps: RunnerDeps = {
    env: {
      GITHUB_EVENT_PATH: 'event.json',
      GITHUB_REPOSITORY: 'acme/app',
      GITHUB_RUN_ID: '555',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SERVER_URL: 'https://github.com',
      ...('key' in opts ? { OPENROUTER_API_KEY: opts.key } : { OPENROUTER_API_KEY: 'sk-or-test' }),
    },
    readFile: async (p) => files[p] ?? null,
    github: {
      getPull: async () => ({ body: 'PR body', headSha: SHA }),
      getDiff: async () => DIFF,
      postReview: async (_r, _n, payload, commit) => {
        if (opts.postReviewThrows) throw new Error('403 forbidden');
        reviews.push({ payload, commit });
      },
      postComment: async (_r, _n, body) => {
        comments.push(body);
      },
    },
    makeLlm,
    log: (m) => logs.push(m),
    now: () => new Date('2026-10-15T10:00:00.000Z'),
    args: { manifestPath: MANIFEST_PATH, postAs: opts.postAs ?? 'github_review' },
  };
  return { deps, reviews, comments, logs, makeLlm };
}

describe('agent-runner runAgent', () => {
  it('invalid manifest -> exit 2, no LLM call, no result', async () => {
    const t = setup({ manifest: 'name: ""\nmodel: 1\n' });
    const out = await runAgent(t.deps);
    expect(out.exitCode).toBe(2);
    expect(out.result).toBeNull();
    expect(t.makeLlm).not.toHaveBeenCalled();
    expect(t.logs.join('\n')).toContain('Manifest validation failed');
  });

  it('missing OPENROUTER_API_KEY -> exit 1 with a failed result', async () => {
    const t = setup({ key: undefined });
    const out = await runAgent(t.deps);
    expect(out.exitCode).toBe(1);
    expect(out.result?.status).toBe('failed');
    expect(out.result?.error).toContain('OPENROUTER_API_KEY');
    expect(t.makeLlm).not.toHaveBeenCalled();
  });

  it('critical finding + ci_fail_on critical -> REQUEST_CHANGES and exit 1', async () => {
    const t = setup();
    const out = await runAgent(t.deps);
    expect(out.exitCode).toBe(1);
    expect(t.reviews).toHaveLength(1);
    expect(t.reviews[0]?.payload.event).toBe('REQUEST_CHANGES');
    expect(t.reviews[0]?.commit).toBe(SHA);
    expect(out.result?.status).toBe('succeeded');
    expect(out.result?.blockers).toBe(1);
  });

  it('same finding with ci_fail_on never -> exit 0', async () => {
    const t = setup({ failOn: 'never' });
    const out = await runAgent(t.deps);
    expect(out.exitCode).toBe(0);
    expect(out.result?.blockers).toBe(0);
    expect(out.result?.findings_count).toBe(1);
  });

  it('post_as none posts nothing', async () => {
    const t = setup({ postAs: 'none' });
    await runAgent(t.deps);
    expect(t.reviews).toHaveLength(0);
    expect(t.comments).toHaveLength(0);
  });

  it('post_as pr_comment posts a comment, not a review', async () => {
    const t = setup({ postAs: 'pr_comment' });
    await runAgent(t.deps);
    expect(t.reviews).toHaveLength(0);
    expect(t.comments).toHaveLength(1);
  });

  it('a PR from a fork is skipped: exit 0, nothing posted, no LLM', async () => {
    const t = setup({ headRepo: 'evil/app' });
    const out = await runAgent(t.deps);
    expect(out.exitCode).toBe(0);
    expect(out.result).toBeNull();
    expect(t.reviews).toHaveLength(0);
    expect(t.makeLlm).not.toHaveBeenCalled();
  });

  it('a manifest with `skills:` null validates', () => {
    const r = loadManifest('name: A\nmodel: m\nsystem_prompt: p\nskills:\n');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.skills).toEqual([]);
  });

  it('rejects a path-traversal skill slug', () => {
    const r = loadManifest(manifestYaml({ skills: ['../../etc/passwd'] }));
    expect(r.ok).toBe(false);
  });

  it('a no-findings review is approved as COMMENT and reported as no_findings', async () => {
    const t = setup({ review: { verdict: 'approve', summary: 'ok', score: 100, findings: [] } });
    const out = await runAgent(t.deps);
    expect(out.exitCode).toBe(0);
    expect(t.reviews[0]?.payload.event).toBe('COMMENT');
    expect(out.result?.status).toBe('no_findings');
  });

  it('a post failure is reported as failed with exit 1', async () => {
    const t = setup({ postReviewThrows: true });
    const out = await runAgent(t.deps);
    expect(out.exitCode).toBe(1);
    expect(out.result?.status).toBe('failed');
    expect(out.result?.error).toContain('403');
  });

  it('the result carries manifest version, model, deps and commit sha and re-parses', async () => {
    const t = setup();
    const out = await runAgent(t.deps);
    const parsed = CiRunResult.parse(JSON.parse(JSON.stringify(out.result)));
    expect(parsed.manifest_version).toBe(3);
    expect(parsed.model).toBe('deepseek/deepseek-v4-flash');
    expect(parsed.commit_sha).toBe(SHA);
    expect(parsed.agent_slug).toBe('sec');
    expect(parsed.pr_number).toBe(7);
    expect(parsed.job_url).toBe('https://github.com/acme/app/actions/runs/555/attempts/1');
    expect(parsed.dependencies.skills[0]?.slug).toBe('owasp');
    expect(parsed.dependencies.skills[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.dependencies.runner_version).toBeTruthy();
  });
});
