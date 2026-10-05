import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

/** The model's draft fixture: all 5 fixed sections, with links to `src/app.ts`. */
const FIXTURE = {
  sections: [
    {
      kind: 'architecture',
      title: 'Architecture',
      body: 'A small Node service.',
      diagram: 'flowchart LR\nA --> B',
      links: [{ label: 'entrypoint', path: 'src/app.ts' }],
    },
    {
      kind: 'critical_paths',
      title: 'Critical paths',
      body: 'The core request path.',
      diagram: null,
      links: [{ label: 'main entrypoint', path: 'src/app.ts' }],
    },
    {
      kind: 'how_to_run',
      title: 'How to run locally',
      body: '```sh\nnpm install\nnpm run dev\n```',
      diagram: null,
      links: [],
    },
    {
      kind: 'reading_path',
      title: 'Reading path',
      body: 'Start here.',
      diagram: null,
      links: [{ label: 'start here', path: 'src/app.ts' }],
    },
    {
      kind: 'first_tasks',
      title: 'First tasks',
      body: 'Good starters.',
      diagram: null,
      links: [{ label: 'add a health check route', path: 'src/app.ts' }],
    },
  ],
};

/** Fails `OnboardingDraftSchema` — missing every required field but `sections`. */
const BROKEN_FIXTURE = { sections: [{ kind: 'architecture' }] };

d('onboarding', () => {
  let pg: PgFixture;
  let clonePath: string;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    const ids = await seed(pg.handle.db);
    workspaceId = ids.workspaceId;

    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-onboarding-'));
    await mkdir(join(clonePath, 'src'), { recursive: true });
    await mkdir(join(clonePath, 'docs'), { recursive: true });
    await writeFile(join(clonePath, 'src', 'app.ts'), 'export const app = 1;\n', 'utf8');
    await writeFile(join(clonePath, 'docs', 'guide.md'), '# Guide\n', 'utf8');

    const [repo] = await pg.handle.db
      .update(t.repos)
      .set({ clonePath })
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')))
      .returning();
    repoId = repo!.id;
  });

  afterAll(async () => {
    await pg?.stop();
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.onboarding).where(eq(t.onboarding.repoId, repoId));
  });

  /** repo-intel stub: only the 4 methods the generate path reads. */
  function stubRepoIntel(opts: {
    status?: 'full' | 'partial' | 'degraded' | 'failed';
    filesIndexed?: number;
    criticalPaths?: string[][];
    topFiles?: string[];
  }): RepoIntel {
    return {
      getIndexState: async () => ({
        status: opts.status ?? 'full',
        filesIndexed: opts.filesIndexed ?? 100,
        filesSkipped: 0,
        durationMs: 0,
        repoId,
        lastIndexedSha: 'abc123',
        indexerVersion: 1,
        updatedAt: new Date(),
      }),
      getRepoMap: async () => ({ text: 'src/app.ts', tokens: 10, cached: false }),
      getCriticalPaths: async () => opts.criticalPaths ?? [['src/app.ts']],
      getTopFilesByRank: async () => opts.topFiles ?? ['src/app.ts'],
    } as unknown as RepoIntel;
  }

  function makeApp(opts: {
    repoIntelOpts?: Parameters<typeof stubRepoIntel>[0];
    fixture?: unknown;
  } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { OnboardingTour: opts.fixture ?? FIXTURE },
    });
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({ OPENROUTER_API_KEY: 'sk-test' }),
        llm: { openrouter: llm },
        repoIntel: stubRepoIntel(opts.repoIntelOpts ?? {}),
      },
    });
  }

  it('GET before any generate returns the not_generated empty state', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      repo_id: repoId,
      status: 'not_generated',
      tour: null,
      generated_at: null,
      limited_data: false,
    });
    await app.close();
  });

  it('POST blocks with 409 index_not_ready when the index is not full, and writes no row', async () => {
    const app = await makeApp({ repoIntelOpts: { status: 'partial' } });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('index_not_ready');
    expect(body.error.details.index_status).toBe('partial');

    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('POST with a full index generates the tour in fixed section order and persists one row', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ready');
    expect(body.tour.sections.map((s: { kind: string }) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'how_to_run',
      'reading_path',
      'first_tasks',
    ]);
    expect(body.generated_at).not.toBeNull();

    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('a subsequent failed generation (bad schema) returns 502 and leaves the stored tour untouched', async () => {
    const app = await makeApp();
    const first = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(first.statusCode).toBe(200);
    const stored = (
      await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId))
    )[0]!;

    const appBroken = await makeApp({ fixture: BROKEN_FIXTURE });
    const second = await appBroken.inject({
      method: 'POST',
      url: `/repos/${repoId}/onboarding/generate`,
    });
    expect(second.statusCode).toBe(502);

    const after = (
      await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId))
    )[0]!;
    expect(after.json).toEqual(stored.json);
    expect(after.generatedAt).toEqual(stored.generatedAt);
    await app.close();
    await appBroken.close();
  });

  it('GET reports limited_data when the index is thin', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

    const thin = await makeApp({
      repoIntelOpts: { filesIndexed: 1, criticalPaths: [], topFiles: [] },
    });
    const res = await thin.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(res.json().limited_data).toBe(true);
    await app.close();
    await thin.close();
  });

  describe('GET /repos/:id/onboarding/file', () => {
    it('serves the content of a path referenced by the stored tour', async () => {
      const app = await makeApp();
      await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/onboarding/file?path=src/app.ts`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().content).toContain('export const app');
      await app.close();
    });

    it('404s a real file that is not referenced by the stored tour', async () => {
      const app = await makeApp();
      await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/onboarding/file?path=docs/guide.md`,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('422s a path traversal attempt', async () => {
      const app = await makeApp();
      await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/onboarding/file?path=../x`,
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });
  });

  it('404s an unknown repo on all three routes', async () => {
    const app = await makeApp();
    const unknown = '00000000-0000-0000-0000-000000000000';
    const get = await app.inject({ method: 'GET', url: `/repos/${unknown}/onboarding` });
    const post = await app.inject({ method: 'POST', url: `/repos/${unknown}/onboarding/generate` });
    const file = await app.inject({
      method: 'GET',
      url: `/repos/${unknown}/onboarding/file?path=src/app.ts`,
    });
    expect(get.statusCode).toBe(404);
    expect(post.statusCode).toBe(404);
    expect(file.statusCode).toBe(404);
    await app.close();
  });

  it('uses the workspace feature-model override instead of the registry default', async () => {
    const overrideLlm = new MockLLMProvider('openai', {
      structuredBySchema: { OnboardingTour: FIXTURE },
    });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({ OPENAI_API_KEY: 'sk-test' }),
        llm: { openai: overrideLlm },
        repoIntel: stubRepoIntel({}),
      },
    });

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { onboarding: { provider: 'openai', model: 'gpt-x' } } },
    });
    expect(put.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(200);
    expect(overrideLlm.calls.some((c) => c.method === 'completeStructured')).toBe(true);
    await app.close();
  });
});
