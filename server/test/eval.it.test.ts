import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { SECURITY_REVIEWER_EVAL_CASES } from '../src/db/seed-evals.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type App = Awaited<ReturnType<typeof buildApp>>;
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Diff the MockGitClient serves for the turn-into-case tests (line 11 added). */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_EXAMPLE_NOT_A_REAL_KEY_000",
   redisUrl: x,
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
 a
+b
`;

/** The `+` lines of a unified diff, without the marker. */
const addedLines = (diff: string) =>
  diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));

type Mode = 'good' | 'changed' | 'broken' | 'nosecrets';

function finding(file: string, line: number, title: string) {
  return {
    id: `f-${file}-${line}`,
    severity: 'CRITICAL',
    category: 'security',
    title,
    file,
    start_line: line,
    end_line: line,
    rationale: 'scripted',
    confidence: 0.9,
    kind: 'finding',
  };
}

/**
 * Scripted LLM: the answer depends on a marker in the SYSTEM message (stands for
 * "good" / "changed" / "broken" / "never report secrets" prompts) and on which
 * seeded case the user message carries (every `+` line of the case diff appears
 * in it). Optionally throws for one case to exercise AC-14.
 */
function scripted(opts: { throwFor?: string } = {}) {
  return (req: { messages: { role: string; content: string }[] }) => {
    const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const user = req.messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n');
    const mode: Mode = system.includes('EVAL_MODE=changed')
      ? 'changed'
      : system.includes('EVAL_MODE=broken')
        ? 'broken'
        : system.includes('EVAL_MODE=nosecrets')
          ? 'nosecrets'
          : 'good';
    const c = SECURITY_REVIEWER_EVAL_CASES.find((sc) =>
      addedLines(sc.input_diff).every((l) => user.includes(l)),
    );
    if (!c) throw new Error('scripted LLM: no seeded case matches the prompt');
    if (opts.throwFor && c.name === opts.throwFor) throw new Error('provider exploded');

    let items = c.expected_output;
    if (mode === 'nosecrets') items = [];
    else if (mode === 'good') items = items.filter((i) => i.kind === 'must_find');
    else if (mode === 'changed') {
      items = items.filter((i) => i.kind === 'must_find' && c.name !== 'ssrf-webhook');
    } // 'broken': flag every expectation item of both kinds
    const findings = items.map((i) => finding(i.file, i.start_line, i.title ?? 'scripted'));
    return {
      verdict: findings.length ? 'request_changes' : 'approve',
      summary: 'scripted',
      score: 50,
      findings,
    };
  };
}

d('eval pipeline (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let secAgentId: string;
  let basePrompt: string;
  const apps: App[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [sec] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'Security Reviewer'));
    secAgentId = sec!.id;
    basePrompt = sec!.systemPrompt;
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  async function appWith(llm?: MockLLMProvider) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        // Keyless secrets: an un-injected provider fails with a handled ConfigError
        // instead of ever making a real billed call (see server INSIGHTS 2026-09-28).
        secrets: new MockSecretsProvider({}),
        ...(llm ? { llm: { openrouter: llm } } : {}),
      },
    });
    apps.push(app);
    return app;
  }

  const scriptedLlm = (opts: { throwFor?: string } = {}) =>
    new MockLLMProvider('openai', { structuredFn: scripted(opts) as never });

  async function waitForEvalRun(app: App, runId: string): Promise<Json> {
    const start = Date.now();
    for (;;) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
      const body = res.json();
      if (body.status && body.status !== 'running') return body;
      if (Date.now() - start > 10_000) throw new Error(`eval run ${runId} still running`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  async function startRun(app: App, agentId: string, payload: unknown = {}) {
    return app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs`, payload: payload as never });
  }

  async function setPrompt(app: App, prompt: string): Promise<number> {
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${secAgentId}`,
      payload: { system_prompt: prompt },
    });
    expect(res.statusCode).toBe(200);
    return res.json().version;
  }

  // ---- finding -> case -------------------------------------------------------

  async function setupFinding(agentId: string | null, number: number) {
    const db = pg.handle.db;
    const name = `evalrepo-${number}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: null })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number,
        title: 'Add Stripe config',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds the key.',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_EXAMPLE_NOT_A_REAL_KEY_000",\n   redisUrl: x,',
    });
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId, kind: 'review', verdict: 'request_changes', summary: 's', score: 50 })
      .returning();
    const [f] = await db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'committed',
        confidence: 0.95,
        kind: 'finding',
      })
      .returning();
    return { findingId: f!.id };
  }

  it('turns accepted / dismissed findings into cases, idempotently, and rejects undecided ones', async () => {
    const app = await appWith();
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Eval Source Agent', provider: 'openrouter', model: 'm', system_prompt: 'sec' },
    });
    const agent = created.json();

    // accepted -> must_find
    const a = await setupFinding(agent.id, 901);
    expect((await app.inject({ method: 'POST', url: `/findings/${a.findingId}/eval-case` })).statusCode).toBe(409); // undecided
    await app.inject({ method: 'POST', url: `/findings/${a.findingId}/accept` });
    const first = await app.inject({ method: 'POST', url: `/findings/${a.findingId}/eval-case` });
    expect(first.statusCode).toBe(201);
    const fb = first.json();
    expect(fb.created).toBe(true);
    expect(fb.case.expected_output[0]).toMatchObject({ kind: 'must_find', file: 'src/config.ts', start_line: 11 });
    expect(fb.case.input_diff).toContain('+++ b/src/config.ts');
    expect(fb.case.input_diff).not.toContain('src/other.ts');
    expect(fb.case.input_meta.decision).toBe('accepted');
    expect(fb.case.source_finding_id).toBe(a.findingId);
    expect(fb.case.owner_id).toBe(agent.id);

    // AC-5: repeating returns the same case
    const again = await app.inject({ method: 'POST', url: `/findings/${a.findingId}/eval-case` });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ created: false, case: { id: fb.case.id } });

    // dismissed -> must_not_flag
    const b = await setupFinding(agent.id, 902);
    await app.inject({ method: 'POST', url: `/findings/${b.findingId}/dismiss` });
    const dismissed = await app.inject({ method: 'POST', url: `/findings/${b.findingId}/eval-case` });
    expect(dismissed.statusCode).toBe(201);
    expect(dismissed.json().case.expected_output[0].kind).toBe('must_not_flag');

    // listing shows both, never-run
    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    expect(list).toHaveLength(2);
    expect(list.every((c: Json) => c.last_run.status === 'never_run')).toBe(true);

    // a review without a producing agent -> 409 finding_no_agent
    const c = await setupFinding(null, 903);
    await app.inject({ method: 'POST', url: `/findings/${c.findingId}/accept` });
    const noAgent = await app.inject({ method: 'POST', url: `/findings/${c.findingId}/eval-case` });
    expect(noAgent.statusCode).toBe(409);
    expect(noAgent.json().error.code).toBe('finding_no_agent');
  });

  // ---- seed ------------------------------------------------------------------

  it('seed ships >= 8 Security Reviewer cases and is idempotent', async () => {
    const count = async () =>
      (await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, secAgentId))).length;
    const before = await count();
    expect(before).toBeGreaterThanOrEqual(8);
    await seed(pg.handle.db);
    expect(await count()).toBe(before);
  });

  // ---- run lifecycle + the scripted experiment --------------------------------

  it('runs all cases, persists batch + per-case rows, and shows prompt changes in the metrics', async () => {
    const llm = scriptedLlm();
    const app = await appWith(llm);
    const n = SECURITY_REVIEWER_EVAL_CASES.length;
    const [agent] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, secAgentId));

    // baseline (good prompt)
    const started = await startRun(app, secAgentId);
    expect(started.statusCode).toBe(202);
    const run1 = started.json().run;
    expect(run1.status).toBe('running');
    expect(run1.agent_version).toBe(agent!.version);
    const base = await waitForEvalRun(app, run1.id);
    expect(base.status).toBe('done');
    expect(base.cases).toHaveLength(n);
    expect(base.aggregate.per_trace).toHaveLength(n);
    expect(base.aggregate.recall).toBe(1);
    expect(base.aggregate.precision).toBe(1);
    expect(base.aggregate.traces_passed).toBe(n);
    const history = (await app.inject({ method: 'GET', url: `/agents/${secAgentId}/eval-runs` })).json();
    expect(history[0].id).toBe(run1.id);

    // AC-18: a second start while one is active -> 409 (deterministic: seed a running row)
    const [blocker] = await pg.handle.db
      .insert(t.evalBatches)
      .values({
        workspaceId,
        agentId: secAgentId,
        agentVersion: 1,
        configJson: {},
        caseIds: [],
      })
      .returning();
    const conflict = await startRun(app, secAgentId);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('eval_run_in_progress');
    await pg.handle.db.delete(t.evalBatches).where(eq(t.evalBatches.id, blocker!.id));

    // changed prompt: loses the SSRF finding -> recall drops
    const v2 = await setPrompt(app, `${basePrompt}\nEVAL_MODE=changed`);
    expect(v2).toBe(agent!.version + 1);
    const changed = await waitForEvalRun(app, (await startRun(app, secAgentId)).json().run.id);
    expect(changed.agent_version).toBe(v2);
    expect(changed.config.system_prompt).toContain('EVAL_MODE=changed');
    expect(changed.aggregate.recall).toBeLessThan(base.aggregate.recall);

    // broken prompt: flags everything -> precision drops, regression alert fires
    const v3 = await setPrompt(app, `${basePrompt}\nEVAL_MODE=broken`);
    const broken = await waitForEvalRun(app, (await startRun(app, secAgentId)).json().run.id);
    expect(broken.agent_version).toBe(v3);
    expect(broken.aggregate.precision).toBeLessThan(base.aggregate.precision);
    const dash = (await app.inject({ method: 'GET', url: `/agents/${secAgentId}/eval-dashboard` })).json();
    expect(dash.regression).toMatchObject({ metric: 'precision', version: v3, previous_version: v2 });
    expect(dash.dashboard.alert).toContain('Precision dropped');
    expect(dash.dashboard.trend).toHaveLength(3);
    expect(dash.dashboard.cases_total).toBe(n);

    // "never report secrets": recall drops
    const v4 = await setPrompt(app, `${basePrompt}\nEVAL_MODE=nosecrets`);
    const nosecrets = await waitForEvalRun(app, (await startRun(app, secAgentId)).json().run.id);
    expect(nosecrets.agent_version).toBe(v4);
    expect(nosecrets.aggregate.recall).toBeLessThan(base.aggregate.recall);
    expect(new Set([base, changed, broken, nosecrets].map((r) => r.agent_version)).size).toBe(4);

    // AC-19/zero LLM during scoring: exactly one structured call per executed case
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(4 * n);

    await setPrompt(app, basePrompt);
  });

  it('partial runs are labelled and kept out of the trend', async () => {
    const app = await appWith(scriptedLlm());
    const cases = (await app.inject({ method: 'GET', url: `/agents/${secAgentId}/eval-cases` })).json();
    const before = (await app.inject({ method: 'GET', url: `/agents/${secAgentId}/eval-dashboard` })).json();
    const res = await startRun(app, secAgentId, { case_ids: [cases[0].id] });
    expect(res.statusCode).toBe(202);
    expect(res.json().run.partial).toBe(true);
    const run = await waitForEvalRun(app, res.json().run.id);
    expect(run.partial).toBe(true);
    expect(run.cases).toHaveLength(1);
    const after = (await app.inject({ method: 'GET', url: `/agents/${secAgentId}/eval-dashboard` })).json();
    expect(after.dashboard.trend).toHaveLength(before.dashboard.trend.length);
    expect(after.runs[0].id).toBe(run.id);
  });

  it('records an errored case, continues, and excludes it from the denominators', async () => {
    const llm = scriptedLlm({ throwFor: 'ssrf-webhook' });
    const app = await appWith(llm);
    const n = SECURITY_REVIEWER_EVAL_CASES.length;
    const run = await waitForEvalRun(app, (await startRun(app, secAgentId)).json().run.id);
    expect(run.status).toBe('done');
    expect(run.errored_count).toBe(1);
    expect(run.aggregate.traces_total).toBe(n - 1);
    const errored = run.cases.filter((c: Json) => c.pass === null);
    expect(errored).toHaveLength(1);
    expect(errored[0].actual_output.error).toContain('provider exploded');
    // the one erroring case made no successful call, the rest made exactly one each
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(n);
  });

  it('a missing provider key fails the run with the review-run error and leaks no secret', async () => {
    const app = await appWith(); // no llm override + keyless secrets
    const run = await waitForEvalRun(app, (await startRun(app, secAgentId)).json().run.id);
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/OPENROUTER_API_KEY is not configured/);
    expect(JSON.stringify(run)).not.toMatch(/sk-or-|sk_live_[A-Za-z0-9]{20,}/);
  });

  it('workspace dashboard lists the agent card and newest-first recent runs', async () => {
    const app = await appWith();
    const dash = (await app.inject({ method: 'GET', url: '/eval-dashboard' })).json();
    const card = dash.agents.find((a: Json) => a.agent_id === secAgentId);
    expect(card.cases_total).toBeGreaterThanOrEqual(8);
    expect(card.last_run).not.toBeNull();
    const times = dash.recent_runs.map((r: Json) => Date.parse(r.started_at));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it('manual case CRUD validates against the diff and cascades run history on delete', async () => {
    const app = await appWith(scriptedLlm());
    const diff = SECURITY_REVIEWER_EVAL_CASES[0]!.input_diff;
    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${secAgentId}/eval-cases`,
      payload: {
        name: 'manual-bad',
        input_diff: diff,
        expected_output: [{ kind: 'must_find', file: 'nope.ts', start_line: 1 }],
      },
    });
    expect(bad.statusCode).toBe(422);
    const ok = await app.inject({
      method: 'POST',
      url: `/agents/${secAgentId}/eval-cases`,
      payload: { name: 'manual-ok', input_diff: diff, expected_output: [] },
    });
    expect(ok.statusCode).toBe(201);
    const id = ok.json().id;
    const put = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${id}`,
      payload: { name: 'manual-renamed', input_diff: diff, expected_output: [] },
    });
    expect(put.json().name).toBe('manual-renamed');
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${id}` })).statusCode).toBe(404);
  });
});
