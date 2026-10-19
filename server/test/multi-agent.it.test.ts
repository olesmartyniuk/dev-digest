import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';
import { ReviewRepository } from '../src/modules/reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

function fixture(severity: 'CRITICAL' | 'WARNING', score: number): Review {
  return {
    verdict: 'request_changes',
    summary: `summary ${severity}`,
    score,
    findings: [
      {
        id: `f-${severity}`,
        severity,
        category: 'security',
        title: `Hardcoded secret (${severity})`,
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'A live key is committed in source.',
        suggestion: 'Use an env var.',
        confidence: 0.9,
        kind: 'finding',
      },
    ],
  };
}

let seq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `multi-agent-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: null })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Add config',
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: 'abc123',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'body',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

d('SPEC-05 multi-agent review (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** openai -> CRITICAL fixture, anthropic -> WARNING fixture (unless `anthropic` is false: no key). */
  function appWith(opts: { anthropic?: boolean } = {}) {
    const anthropic = opts.anthropic ?? true;
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        // Keyless secrets: intent classification must never hit a real provider.
        secrets: new MockSecretsProvider({}),
        llm: {
          openai: new MockLLMProvider('openai', { structured: fixture('CRITICAL', 40) }),
          ...(anthropic
            ? { anthropic: new MockLLMProvider('anthropic', { structured: fixture('WARNING', 70) }) }
            : {}),
        },
      },
    });
  }

  async function mkAgent(app: Awaited<ReturnType<typeof appWith>>, name: string, provider: 'openai' | 'anthropic') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider, model: provider === 'openai' ? 'gpt-4.1' : 'claude-sonnet-4', system_prompt: name },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  const counts = async () => {
    const db = pg.handle.db;
    const [parents] = await db.select({ n: sql<number>`count(*)::int` }).from(t.multiAgentRuns);
    const [runs] = await db.select({ n: sql<number>`count(*)::int` }).from(t.agentRuns);
    return { parents: parents!.n, runs: runs!.n };
  };

  it('starts a multi-agent run, validates input, and keeps legacy forms parentless', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const a = await mkAgent(app, 'Alpha', 'openai');
    const b = await mkAgent(app, 'Beta', 'anthropic');

    const ok = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentIds: [a.id, b.id] } });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.multi_agent_run_id).toBeTruthy();
    expect(body.runs).toHaveLength(2);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    const linked = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, body.multi_agent_run_id));
    expect(linked).toHaveLength(2);

    // every rejected form leaves the tables untouched
    const before = await counts();
    const unknown = '33333333-3333-4333-8333-333333333333';
    for (const [payload, status] of [
      [{ agentIds: [a.id, a.id] }, 422],
      [{ agentIds: [] }, 422],
      [{ agentIds: ['not-a-uuid'] }, 422],
      [{ agentIds: [a.id], all: true }, 422],
      [{ agentIds: [a.id], agentId: b.id }, 422],
      [{ agentIds: [a.id, unknown] }, 404],
    ] as const) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload });
      expect(res.statusCode).toBe(status);
    }
    expect(await counts()).toEqual(before);

    // legacy forms: no parent, no multi_agent_run_id
    const parentsBefore = before.parents;
    const single = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: a.id } });
    expect(single.statusCode).toBe(200);
    expect(single.json()).not.toHaveProperty('multi_agent_run_id');
    const all = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } });
    expect(all.json()).not.toHaveProperty('multi_agent_run_id');
    await waitForPrRuns(pg.handle.db, pr.id);
    expect((await counts()).parents).toBe(parentsBefore);
    const orphans = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(isNotNull(t.agentRuns.multiAgentRunId));
    expect(orphans.every((r) => r.multiAgentRunId === body.multi_agent_run_id)).toBe(true);
    await app.close();
  });

  it('serves the results view with grouped findings and disagreement locations', async () => {
    const app = await appWith();
    const pr = await setupPr(pg.handle.db, workspaceId);
    const a = await mkAgent(app, 'Gamma', 'openai');
    const b = await mkAgent(app, 'Delta', 'anthropic');
    const started = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentIds: [a.id, b.id] } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const res = await app.inject({ method: 'GET', url: `/multi-agent-runs/${started.multi_agent_run_id}` });
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(view.columns).toHaveLength(2);
    expect(view.agent_count).toBe(2);
    expect(view.columns.map((c: { agent_name: string }) => c.agent_name)).toEqual(['Delta', 'Gamma']);
    expect(view.in_flight).toBe(false);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].finding_ids).toHaveLength(2);
    for (const c of view.columns) expect(c.findings[0].group_id).toBe(view.groups[0].id);
    expect(view.locations).toHaveLength(1);
    expect(view.locations[0].is_conflict).toBe(true); // CRITICAL vs WARNING

    const latest = (await app.inject({ method: 'GET', url: '/multi-agent-runs/latest' })).json();
    expect(latest.id).toBe(started.multi_agent_run_id);
    await app.close();
  });

  it('shows a failed column with its error while the other column is done (AC-16)', async () => {
    const app = await appWith({ anthropic: false });
    const pr = await setupPr(pg.handle.db, workspaceId);
    const a = await mkAgent(app, 'Epsilon', 'openai');
    const b = await mkAgent(app, 'Zeta', 'anthropic');
    const started = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentIds: [a.id, b.id] } })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    const view = (await app.inject({ method: 'GET', url: `/multi-agent-runs/${started.multi_agent_run_id}` })).json();
    const byName = Object.fromEntries(view.columns.map((c: { agent_name: string }) => [c.agent_name, c]));
    expect(byName.Epsilon.status).toBe('done');
    expect(byName.Zeta.status).toBe('failed');
    expect(byName.Zeta.error).toBeTruthy();
    expect(view.locations).toEqual([]); // fewer than 2 done columns
    await app.close();
  });

  it('createMultiAgentRunWithRuns is atomic: a failing child insert leaves no parent and no runs', async () => {
    const db = pg.handle.db;
    const pr = await setupPr(db, workspaceId);
    const repo = new ReviewRepository(db);
    const before = await counts();

    // A nonexistent agent id violates agent_runs.agent_id's FK AFTER the parent row is inserted.
    await expect(
      repo.createMultiAgentRunWithRuns({
        workspaceId,
        prId: pr.id,
        agents: [{ id: '44444444-4444-4444-8444-444444444444', provider: 'openai', model: 'gpt-4.1' }],
      }),
    ).rejects.toThrow();
    expect(await counts()).toEqual(before);

    // and the happy path creates 1 parent + N linked children
    const app = await appWith();
    const a = await mkAgent(app, 'Atomic A', 'openai');
    const b = await mkAgent(app, 'Atomic B', 'openai');
    const ok = await repo.createMultiAgentRunWithRuns({
      workspaceId,
      prId: pr.id,
      agents: [
        { id: a.id, provider: 'openai', model: 'gpt-4.1' },
        { id: b.id, provider: 'openai', model: 'gpt-4.1' },
      ],
    });
    expect(ok.runIds.size).toBe(2);
    const after = await counts();
    expect(after).toEqual({ parents: before.parents + 1, runs: before.runs + 2 });
    await app.close();
  });

  it('404s a cross-workspace parent run', async () => {
    const app = await appWith();
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: 'other' } as typeof t.workspaces.$inferInsert).returning();
    const pr = await setupPr(db, other!.id);
    const [parent] = await db
      .insert(t.multiAgentRuns)
      .values({ workspaceId: other!.id, prId: pr.id })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/multi-agent-runs/${parent!.id}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('estimates average only the newest 10 done runs and keep null cost null', async () => {
    const app = await appWith();
    const db = pg.handle.db;
    const agent = await mkAgent(app, 'Estimator', 'openai');
    const base = Date.now() - 100 * 60_000;
    // 12 done runs; the two oldest are outliers that must fall outside the window.
    for (let i = 0; i < 12; i++) {
      await db.insert(t.agentRuns).values({
        workspaceId,
        agentId: agent.id,
        status: 'done',
        source: 'local',
        durationMs: i < 2 ? 1_000_000 : 2000,
        costUsd: null,
        ranAt: new Date(base + i * 60_000),
      });
    }
    const list = (await app.inject({ method: 'GET', url: '/multi-agent/estimates' })).json() as Array<{
      agent_id: string;
      sample_size: number;
      mean_duration_ms: number | null;
      mean_cost_usd: number | null;
    }>;
    const est = list.find((e) => e.agent_id === agent.id)!;
    expect(est.sample_size).toBe(10);
    expect(est.mean_duration_ms).toBe(2000);
    expect(est.mean_cost_usd).toBeNull();
    // an enabled agent with no history is still listed
    const fresh = await mkAgent(app, 'Fresh', 'openai');
    const again = (await app.inject({ method: 'GET', url: '/multi-agent/estimates' })).json() as typeof list;
    expect(again.find((e) => e.agent_id === fresh.id)).toMatchObject({ sample_size: 0, mean_duration_ms: null });
    await app.close();
  });
});
