import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import {
  agentManifest,
  agentYaml,
  generateCiFiles,
  workflowYaml,
  type CiGenerateInput,
} from '../src/modules/ci/generator.js';
import { assertRepoRef, ciVerdict, isOutOfDate, slugify, uniqueSlug } from '../src/modules/ci/helpers.js';

const base = (over: Partial<CiGenerateInput> = {}): CiGenerateInput => ({
  agent: {
    name: 'Security Reviewer',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    systemPrompt: 'Review for security: look for "secrets" # not comments\nSecond line: with colon',
    strategy: 'auto',
    ciFailOn: 'critical',
    version: 4,
  },
  agentSlug: 'security-reviewer',
  skills: [
    { slug: 'owasp', body: '# OWASP\nbody' },
    { slug: 'secrets', body: '# Secrets' },
  ],
  postAs: 'github_review',
  triggers: ['opened', 'synchronize'],
  runnerBundle: '/* bundle */\nconsole.log(1);',
  ...over,
});

describe('ci generator', () => {
  it('is deterministic for identical input', () => {
    expect(generateCiFiles(base())).toEqual(generateCiFiles(base()));
  });

  it('round-trips the manifest through the shared schema', () => {
    const input = base();
    const manifest = agentManifest(input);
    const parsed = AgentManifest.parse(parse(agentYaml(manifest)));
    expect(parsed).toEqual(manifest);
    expect(parsed.system_prompt).toBe(input.agent.systemPrompt);
    expect(parsed.version).toBe(4);
  });

  it('emits files in order and only the workflow is editable', () => {
    const files = generateCiFiles(base());
    expect(files.map((f) => f.path)).toEqual([
      '.devdigest/agents/security-reviewer.yaml',
      '.devdigest/skills/owasp.md',
      '.devdigest/skills/secrets.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/agent-runner.cjs',
      '.github/workflows/devdigest-security-reviewer.yml',
    ]);
    expect(files.filter((f) => f.editable).map((f) => f.path)).toEqual([
      '.github/workflows/devdigest-security-reviewer.yml',
    ]);
    expect(files.find((f) => f.path.endsWith('agent-runner.cjs'))?.contents).toBe(base().runnerBundle);
  });

  it('with no skills: no skill files and `skills: []`', () => {
    const files = generateCiFiles(base({ skills: [] }));
    expect(files.some((f) => f.path.startsWith('.devdigest/skills/'))).toBe(false);
    expect(files[0]?.contents).toContain('skills: []');
  });

  it('workflow follows the trigger selection and post-as', () => {
    const wf = workflowYaml({ agentName: 'A', agentSlug: 'a', postAs: 'pr_comment', triggers: ['reopened', 'opened'] });
    expect(wf).toContain('types: [opened, reopened]');
    expect(wf).toContain('--post-as pr_comment');
    expect(workflowYaml({ agentName: 'A', agentSlug: 'a', postAs: 'none', triggers: ['synchronize'] })).toContain(
      'types: [synchronize]',
    );
  });

  it('workflow skips forks, always uploads, references only the OpenRouter secret, keeps the placeholder', () => {
    const wf = generateCiFiles(base()).at(-1)!.contents;
    expect(wf).toContain("env.SAME_REPO != 'true'");
    expect(wf).toContain("if: always() && env.SAME_REPO == 'true'");
    expect(wf).toContain('secrets.OPENROUTER_API_KEY');
    expect(wf).not.toContain('OPENAI_API_KEY');
    expect(wf).toContain('# - uses: devdigest/review-action@v1');
    expect(wf).toContain('name: devdigest-result-security-reviewer-${{ github.run_id }}-${{ github.run_attempt }}');
    const doc = parse(wf) as { jobs: { review: { steps: unknown[] } } };
    expect(doc.jobs.review.steps.length).toBe(5);
  });

  it('an agent name can never open a GitHub expression', () => {
    const wf = workflowYaml({
      agentName: '${{ secrets.X }}',
      agentSlug: 'a',
      postAs: 'none',
      triggers: ['opened'],
    });
    expect(wf.split('\n')[0]).not.toContain('${{');
  });

  it('contains no secret values', () => {
    const joined = generateCiFiles(base())
      .filter((f) => !f.path.endsWith('.cjs'))
      .map((f) => f.contents)
      .join('\n');
    expect(joined).not.toMatch(/sk-or-|ghp_|github_pat_/);
  });
});

describe('ci helpers', () => {
  it('slugify and uniqueSlug', () => {
    expect(slugify('Security  Reviewer!')).toBe('security-reviewer');
    expect(slugify('***')).toBe('agent');
    expect(uniqueSlug('a', 'abcdef12-0000', new Set())).toBe('a');
    expect(uniqueSlug('a', 'abcdef12-0000', new Set(['a']))).toBe('a-abcdef');
  });

  it('assertRepoRef rejects shell metacharacters', () => {
    expect(assertRepoRef('acme', 'app.js')).toEqual({ owner: 'acme', name: 'app.js' });
    expect(() => assertRepoRef('a', 'b;rm -rf')).toThrow();
  });

  it('derives the verdict and out-of-date state', () => {
    expect(ciVerdict('failed', 3)).toBe('failed');
    expect(ciVerdict('done', 0)).toBe('no_findings');
    expect(ciVerdict('done', 2)).toBe('succeeded');
    expect(isOutOfDate(null, 1)).toBe(true);
    expect(isOutOfDate(2, 3)).toBe(true);
    expect(isOutOfDate(3, 3)).toBe(false);
  });
});
