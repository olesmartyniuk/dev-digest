import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type App = Awaited<ReturnType<typeof buildApp>>;
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const SLUG = 'security-reviewer';
const SHA = 'b'.repeat(40);

/** A valid `devdigest-result.json` for a given workflow run id. */
function result(runId: number, over: Record<string, unknown> = {}) {
  return {
    findings_count: 2,
    critical: 1,
    warning: 1,
    suggestion: 0,
    cost_usd: null,
    duration_ms: 4200,
    agent: 'Security Reviewer',
    version: '1',
    pr_number: 7,
    status: 'succeeded',
    blockers: 1,
    agent_slug: SLUG,
    repository: 'acme/ci-app',
    job_url: `https://github.com/acme/ci-app/actions/runs/${runId}/attempts/1`,
    github_run_id: runId,
    github_run_attempt: 1,
    model: 'deepseek/deepseek-v4-flash',
    manifest_version: 1,
    commit_sha: SHA,
    dependencies: { skills: [{ slug: 'rubric', sha256: 'a'.repeat(64) }], runner_version: '0.1.0', reviewer_core_version: '0.0.0' },
    finished_at: `2026-10-15T10:0${runId % 10}:00.000Z`,
    ...over,
  };
}

const artifact = (runId: number, files: Record<string, string>) => ({
  id: runId,
  name: `devdigest-result-${SLUG}-${runId}-1`,
  files,
});

d('ci export + ingest (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;
  let repoId: string;
  const apps: App[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [sec] = await db.select().from(t.agents).where(eq(t.agents.name, 'Security Reviewer'));
    agentId = sec!.id;
    await db.update(t.agents).set({ provider: 'openrouter' }).where(eq(t.agents.id, agentId));
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ci-app', fullName: 'acme/ci-app', clonePath: null })
      .returning();
    repoId = repo!.id;
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  async function appWith(github: MockGitHubClient) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        secrets: new MockSecretsProvider({}),
        github,
      },
    });
    apps.push(app);
    return app;
  }

  const sync = (app: App) => app.inject({ method: 'POST', url: '/ci/sync' });

  it('ingests valid artifacts once, rejects invalid ones, and lists only CI runs newest first', async () => {
    const gh = new MockGitHubClient({
      artifacts: [
        artifact(555, { 'devdigest-result.json': JSON.stringify(result(555)) }),
        artifact(556, { 'devdigest-result.json': '{not json' }),
        artifact(557, { 'devdigest-result.json': JSON.stringify(result(557, { repository: 'evil/other' })) }),
        artifact(558, { 'devdigest-result.json': JSON.stringify(result(558)) }),
      ],
    });
    const app = await appWith(gh);

    // Zip-style install: persists the installation without any GitHub write.
    const inst = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/export-ci`,
      payload: { repo_id: repoId, action: 'files' },
    });
    expect(inst.statusCode).toBe(200);
    expect(gh.committed).toHaveLength(0);

    const first = await sync(app);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ ingested: 2, skipped: 2, error: null });

    const db = pg.handle.db;
    const rows = await db.select().from(t.agentRuns).where(eq(t.agentRuns.source, 'ci'));
    expect(rows).toHaveLength(2);
    const row = rows.find((r) => r.ciRunKey === '555-1')!;
    expect(row.status).toBe('done');
    expect(row.prId).toBeNull();
    expect(row.costUsd).toBeNull();
    expect(row.ciRepo).toBe('acme/ci-app');
    expect(row.ciPrNumber).toBe(7);
    const [trace] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, row.id));
    const cfg = (trace!.trace as Json).config;
    expect(cfg).toMatchObject({ source: 'ci', manifest_version: 1, commit_sha: SHA, model: 'deepseek/deepseek-v4-flash' });
    expect(cfg.dependencies.runner_version).toBe('0.1.0');

    // Idempotent: a second sync ingests nothing new.
    const again = await sync(app);
    expect(again.json().ingested).toBe(0);
    expect(await db.select().from(t.agentRuns).where(eq(t.agentRuns.source, 'ci'))).toHaveLength(2);

    // A local run must never show up in the CI list.
    await db.insert(t.agentRuns).values({ workspaceId, agentId, source: 'local', status: 'done', findingsCount: 1 });
    const list = (await app.inject({ method: 'GET', url: '/ci/runs' })).json() as Json[];
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.repo === 'acme/ci-app')).toBe(true);
    expect(list.map((r) => r.id)).toEqual(
      [...list].sort((a, b) => b.ran_at.localeCompare(a.ran_at)).map((r) => r.id),
    );
    expect(list[0]).toMatchObject({ status: 'succeeded', blocking: true, cost_usd: null, agent_name: 'Security Reviewer' });
  });

  it('shows the latest run on the installation and flags it out of date after a config change', async () => {
    const app = await appWith(new MockGitHubClient());
    const before = (await app.inject({ method: 'GET', url: `/agents/${agentId}/ci` })).json() as Json;
    expect(before.installations).toHaveLength(1);
    expect(before.installations[0].latest_run).toMatchObject({ status: 'succeeded', blocking: true });
    expect(before.installations[0].out_of_date).toBe(false);
    expect(before.runs).toHaveLength(2);

    const put = await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { ci_fail_on: 'any' } });
    expect(put.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: `/agents/${agentId}/ci` })).json() as Json;
    expect(after.installations[0].out_of_date).toBe(true);
    expect(after.ci_fail_on).toBe('any');
  });

  it('a GitHub failure during sync returns 200 with an error and keeps ingested runs listed', async () => {
    const gh = new MockGitHubClient();
    vi.spyOn(gh, 'listArtifacts').mockRejectedValue(new Error('403 Resource not accessible by personal access token'));
    const app = await appWith(gh);
    const res = await sync(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().error).toContain('Could not fetch CI results from GitHub');
    const list = (await app.inject({ method: 'GET', url: '/ci/runs' })).json() as Json[];
    expect(list).toHaveLength(2);
  });
});
