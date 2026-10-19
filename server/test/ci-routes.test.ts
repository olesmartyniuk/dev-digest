import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { CiRepository } from '../src/modules/ci/repository.js';
import type { InstallationRow, RepoRow } from '../src/modules/ci/repository.js';
import type { AgentRow } from '../src/db/rows.js';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Hermetic (no-DB) route tests for the ci module, following eval-routes.test.ts:
 * the agents repo and CiRepository are stubbed with `vi.spyOn`, GitHub is a mock.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT_ID = '22222222-2222-2222-2222-222222222222';
const REPO_ID = '55555555-5555-5555-5555-555555555555';

const agentRow = (over: Partial<AgentRow> = {}): AgentRow =>
  ({
    id: AGENT_ID,
    workspaceId: 'w1',
    name: 'Security Reviewer',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    systemPrompt: 'You review security.',
    strategy: 'auto',
    ciFailOn: 'critical',
    version: 3,
    ...over,
  }) as AgentRow;

const repoRow = (): RepoRow =>
  ({ id: REPO_ID, workspaceId: 'w1', owner: 'acme', name: 'app', defaultBranch: 'trunk' }) as RepoRow;

const installRow = (): InstallationRow =>
  ({
    id: '66666666-6666-6666-6666-666666666666',
    agentId: AGENT_ID,
    repo: 'acme/app',
    targetType: 'gha',
    installedAt: new Date('2026-10-15T10:00:00Z'),
    agentSlug: 'security-reviewer',
    workflowVersion: 3,
    prUrl: null,
    updatedAt: new Date(),
  }) as InstallationRow;

describe('ci routes (no DB)', () => {
  let app: App | undefined;

  async function boot(opts: { gh?: MockGitHubClient; secrets?: Record<string, string>; agent?: AgentRow } = {}) {
    const gh = opts.gh ?? new MockGitHubClient();
    app = await buildApp({
      config,
      overrides: {
        auth: new MockAuthProvider(),
        secrets: new MockSecretsProvider(opts.secrets ?? {}),
        github: gh,
      },
    });
    vi.spyOn(app.container.agentsRepo, 'getById').mockResolvedValue(opts.agent ?? agentRow());
    vi.spyOn(app.container.agentsRepo, 'linkedSkills').mockResolvedValue([
      { skill: { id: 's1', name: 'OWASP Rubric', body: '# rubric', enabled: true } as never, order: 0 },
      { skill: { id: 's2', name: 'Disabled', body: 'x', enabled: false } as never, order: 1 },
    ]);
    vi.spyOn(app.container.agentsRepo, 'list').mockResolvedValue([agentRow()]);
    vi.spyOn(CiRepository.prototype, 'getRepo').mockResolvedValue(repoRow());
    vi.spyOn(CiRepository.prototype, 'findInstallation').mockResolvedValue(undefined);
    const upsert = vi.spyOn(CiRepository.prototype, 'upsertInstallation').mockResolvedValue(installRow());
    return { a: app, gh, upsert };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  const body = (over: Record<string, unknown> = {}) => ({ repo_id: REPO_ID, ...over });

  it('rejects bad input with 422 before the handler runs', async () => {
    const { a } = await boot();
    const closed = await a.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/export-ci/preview`,
      payload: body({ triggers: ['closed'] }),
    });
    expect(closed.statusCode).toBe(422);
    const badId = await a.inject({
      method: 'POST',
      url: '/agents/not-a-uuid/export-ci/preview',
      payload: body(),
    });
    expect(badId.statusCode).toBe(422);
  });

  it('409 ci_provider_unsupported for a non-OpenRouter agent (preview and install)', async () => {
    const { a, gh, upsert } = await boot({ agent: agentRow({ provider: 'openai' }) });
    for (const url of [`/agents/${AGENT_ID}/export-ci/preview`, `/agents/${AGENT_ID}/export-ci`]) {
      const res = await a.inject({ method: 'POST', url, payload: body({ action: 'open_pr' }) });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ci_provider_unsupported');
    }
    expect(gh.committed).toHaveLength(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('preview marks existing paths and reports the OpenRouter key state', async () => {
    const gh = new MockGitHubClient({ existingPaths: ['.devdigest/memory.jsonl'] });
    const { a } = await boot({ gh, secrets: { OPENROUTER_API_KEY: 'sk-or-x' } });
    const res = await a.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/export-ci/preview`,
      payload: body(),
    });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.openrouter_key_ready).toBe(true);
    expect(j.base_branch).toBe('trunk');
    expect(j.agent_slug).toBe('security-reviewer');
    const byPath = Object.fromEntries(j.files.map((f: { path: string; exists: boolean }) => [f.path, f.exists]));
    expect(byPath['.devdigest/memory.jsonl']).toBe(true);
    expect(byPath['.devdigest/agents/security-reviewer.yaml']).toBe(false);
    expect(j.files.map((f: { path: string }) => f.path)).toContain('.devdigest/skills/owasp-rubric.md');
    expect(j.files.some((f: { path: string }) => f.path.includes('disabled'))).toBe(false);

    const noKey = await boot();
    const res2 = await noKey.a.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/export-ci/preview`,
      payload: body(),
    });
    expect(res2.json().openrouter_key_ready).toBe(false);
  });

  it('install open_pr commits to devdigest/ci against the default branch and records the installation once', async () => {
    const { a, gh, upsert } = await boot();
    const res = await a.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/export-ci`,
      payload: body({ action: 'open_pr' }),
    });
    expect(res.statusCode).toBe(200);
    expect(gh.committed).toHaveLength(1);
    expect(gh.committed[0]?.branch).toBe('devdigest/ci');
    expect(gh.committed[0]?.base).toBe('trunk');
    expect(gh.openedPrs[0]?.title).toBe('Add DevDigest CI review');
    expect(res.json().pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({ workflowVersion: 3, agentSlug: 'security-reviewer', prUrl: 'https://github.com/mock/mock/pull/1' });
  });

  it('an edited workflow replaces only the workflow file', async () => {
    const { a, gh } = await boot();
    const res = await a.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/export-ci`,
      payload: body({ action: 'open_pr', workflow: 'name: edited\n' }),
    });
    expect(res.statusCode).toBe(200);
    const files = gh.committed[0]!.files;
    const wf = files.find((f) => f.path === '.github/workflows/devdigest-security-reviewer.yml');
    expect(wf?.contents).toBe('name: edited\n');
    const manifest = files.find((f) => f.path === '.devdigest/agents/security-reviewer.yaml');
    expect(manifest?.contents).toContain('Security Reviewer');
    expect(manifest?.contents).not.toContain('edited');
  });

  it('a failing commit returns 502 and persists nothing', async () => {
    const { a, gh, upsert } = await boot();
    vi.spyOn(gh, 'commitFiles').mockRejectedValue(new Error('403 Resource not accessible'));
    const res = await a.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/export-ci`,
      payload: body({ action: 'open_pr' }),
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toContain('download the files as a zip');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('action files makes no GitHub call but records the installation', async () => {
    const { a, gh, upsert } = await boot();
    const res = await a.inject({
      method: 'POST',
      url: `/agents/${AGENT_ID}/export-ci`,
      payload: body({ action: 'files' }),
    });
    expect(res.statusCode).toBe(200);
    expect(gh.committed).toHaveLength(0);
    expect(gh.openedPrs).toHaveLength(0);
    expect(res.json().pr_url).toBeNull();
    expect(res.json().files.length).toBeGreaterThanOrEqual(5);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({ prUrl: null });
  });
});
