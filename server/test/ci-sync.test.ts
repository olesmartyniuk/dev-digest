import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { CiRepository } from '../src/modules/ci/repository.js';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Hermetic (no-DB) tests of the ingest rejection paths in CiService.sync,
 * driven through POST /ci/sync with a stubbed CiRepository and a mock GitHub.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT_ID = '22222222-2222-2222-2222-222222222222';
const SLUG = 'security-reviewer';
const FILE = 'devdigest-result.json';

const result = (runId: number, over: Record<string, unknown> = {}) => ({
  findings_count: 2,
  cost_usd: null,
  agent: 'Security Reviewer',
  status: 'succeeded',
  blockers: 0,
  agent_slug: SLUG,
  repository: 'acme/app',
  job_url: `https://github.com/acme/app/actions/runs/${runId}/attempts/1`,
  github_run_id: runId,
  github_run_attempt: 1,
  model: 'deepseek/deepseek-v4-flash',
  manifest_version: 1,
  commit_sha: null,
  dependencies: { skills: [], runner_version: '0.1.0', reviewer_core_version: '0.0.0' },
  finished_at: '2026-10-15T10:00:00.000Z',
  ...over,
});

const art = (
  runId: number,
  files: Record<string, string>,
  over: { name?: string; expired?: boolean } = {},
) => ({
  id: runId,
  name: over.name ?? `devdigest-result-${SLUG}-${runId}-1`,
  expired: over.expired,
  files,
});

describe('ci sync (no DB)', () => {
  let app: App | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  async function boot(gh: MockGitHubClient, opts: { installs?: unknown[]; known?: string[] } = {}) {
    app = await buildApp({
      config,
      overrides: { auth: new MockAuthProvider(), secrets: new MockSecretsProvider({}), github: gh },
    });
    const installs = opts.installs ?? [
      { id: 'i1', agentId: AGENT_ID, repo: 'acme/app', targetType: 'gha', agentSlug: SLUG },
    ];
    const list = vi.spyOn(CiRepository.prototype, 'listInstallations').mockResolvedValue(installs as never);
    vi.spyOn(CiRepository.prototype, 'knownRunKeys').mockResolvedValue(new Set(opts.known ?? []));
    const insert = vi.spyOn(CiRepository.prototype, 'insertCiRun').mockResolvedValue(true);
    return { a: app, list, insert };
  }

  const sync = (a: App, payload?: unknown) =>
    a.inject({ method: 'POST', url: '/ci/sync', payload: payload as never });

  it('ingests only results that pass every check and counts the rest as skipped', async () => {
    const json = (o: unknown) => JSON.stringify(o);
    const gh = new MockGitHubClient({
      artifacts: [
        art(1, { [FILE]: json(result(1)) }), // ok
        art(2, { [FILE]: json(result(2, { repository: 'ACME/App' })) }), // case-insensitive repo match: ok
        art(3, { [FILE]: json(result(3, { agent_slug: 'someone-else' })) }), // slug mismatch
        art(4, { [FILE]: json(result(4, { github_run_id: 99 })) }), // run id != artifact name
        art(5, { [FILE]: json(result(5, { job_url: 'https://evil.example/x' })) }), // schema
        art(6, { other: 'x' }), // result file missing
        art(7, { [FILE]: 'x'.repeat(256 * 1024 + 1) }), // too large
        art(8, { [FILE]: json(result(8)) }, { name: `devdigest-result-${SLUG}-8-1-extra` }), // malformed name: not counted
        art(9, { [FILE]: json(result(9)) }, { expired: true }), // expired: not listed
      ],
    });
    const { a, insert } = await boot(gh);

    const res = await sync(a);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ingested: 2, skipped: 5, error: null });
    expect(insert.mock.calls.map((c) => (c[2] as { github_run_id: number }).github_run_id)).toEqual([1, 2]);
    // Rows are attached to the installation's agent, never one named by the artifact.
    expect(insert.mock.calls.every((c) => c[1] === AGENT_ID)).toBe(true);
  });

  it('does not re-read known runs, and a lost insert race counts as neither ingested nor skipped', async () => {
    const gh = new MockGitHubClient({
      artifacts: [art(1, { [FILE]: JSON.stringify(result(1)) }), art(2, { [FILE]: JSON.stringify(result(2)) })],
    });
    const read = vi.spyOn(gh, 'readArtifactFile');
    const { a, insert } = await boot(gh, { known: ['1-1'] });
    insert.mockResolvedValue(false); // the unique index rejected it

    const res = await sync(a);
    expect(res.json()).toEqual({ ingested: 0, skipped: 0, error: null });
    expect(read).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('with no usable installation it returns zeros without touching GitHub; body and agent_id are validated', async () => {
    const gh = new MockGitHubClient();
    const listArtifacts = vi.spyOn(gh, 'listArtifacts');
    const { a, list } = await boot(gh, {
      installs: [
        { id: 'i1', agentId: AGENT_ID, repo: 'acme/app', targetType: 'gha', agentSlug: null }, // not yet slugged
        { id: 'i2', agentId: AGENT_ID, repo: 'acme/app', targetType: 'other', agentSlug: SLUG },
      ],
    });

    const res = await sync(a);
    expect(res.json()).toEqual({ ingested: 0, skipped: 0, error: null });
    expect(listArtifacts).not.toHaveBeenCalled();

    await sync(a, { agent_id: AGENT_ID });
    expect(list).toHaveBeenLastCalledWith(expect.any(String), AGENT_ID);
    expect((await sync(a, { agent_id: 'nope' })).statusCode).toBe(422);
  });

  it('an invalid stored repo name is reported as a sync error, never sent to GitHub', async () => {
    const gh = new MockGitHubClient();
    const listArtifacts = vi.spyOn(gh, 'listArtifacts');
    const { a } = await boot(gh, {
      installs: [{ id: 'i1', agentId: AGENT_ID, repo: 'acme/app;rm', targetType: 'gha', agentSlug: SLUG }],
    });

    const res = await sync(a);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ingested: 0, skipped: 0 });
    expect(res.json().error).toMatch(/^Could not fetch CI results from GitHub/);
    expect(listArtifacts).not.toHaveBeenCalled();
  });
});
