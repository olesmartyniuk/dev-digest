import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A well-formed IntentClassification fixture; individual tests override fields. */
const FIXTURE = {
  intent: 'Add rate limiting to protect the public API.',
  in_scope: ['rate limiting middleware'],
  out_of_scope: ['logging cleanup'],
  confidence: 'high',
  confidence_reason: 'The description states the goal explicitly.',
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { body?: string | null } = {},
) {
  const name = `intent-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 501,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef1234',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: opts.body ?? 'Add rate limiting to the public API endpoints.',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

/**
 * L03 PR intent classification — DB-backed because it exercises the real
 * `pr_intent` upsert/read round-trip and the route-level 200-on-handled-
 * failure contract, neither of which the hermetic helpers test can see.
 */
d('L03 PR intent classification (Testcontainers pg)', () => {
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

  /**
   * `git.diff` returns no files (empty raw diff) so the service falls back to
   * `pr_files` reconstruction — the path the "no body leak" test exercises.
   * `secrets` has no keys at all, so an un-overridden provider always fails
   * with a clean ConfigError instead of ever reaching a real network call.
   */
  function appWith(opts: { openrouter?: MockLLMProvider | null } = {}) {
    const openrouter = opts.openrouter === null ? undefined : opts.openrouter ?? new MockLLMProvider('openai', {
      structuredBySchema: { IntentClassification: FIXTURE },
    });
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
        llm: openrouter ? { openrouter } : {},
      },
    });
  }

  it('GET before classification returns intent: null, skipped: null', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null, skipped: null });

    await app.close();
  });

  it('POST classifies, persists tokens/cost/sources, and forces tool-calling output mode', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: FIXTURE } });
    const app = await appWith({ openrouter: llm });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.skipped).toBeNull();
    expect(body.intent.pr_id).toBe(pr.id);
    expect(body.intent.confidence).toBe('high');
    expect(body.intent.tokens_in).toBe(100);
    expect(body.intent.tokens_out).toBe(50);
    expect(body.intent.cost_usd).toBeCloseTo(0.001, 5);
    expect(body.intent.sources.length).toBeGreaterThan(0);

    // Persisted row round-trips on a later GET too.
    const getRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(getRes.json().intent.pr_id).toBe(pr.id);

    // The classifier call MUST force tool-calling (Step 2's opt-in outputMode),
    // not the strict json_schema default every other structured call uses.
    expect(llm.calls).toHaveLength(1);
    expect((llm.calls[0]!.req as { outputMode?: string }).outputMode).toBe('tool');

    await app.close();
  });

  it('an empty PR description forces confidence to low, even though the fixture model output says high', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: FIXTURE } });
    const app = await appWith({ openrouter: llm });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, { body: '' });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent.confidence).toBe('low');
    expect(body.intent.confidence_reason).toContain('No PR description');

    await app.close();
  });

  it('a Notion link in the body becomes an unavailable source, and its content is never sent to the model', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: FIXTURE } });
    const app = await appWith({ openrouter: llm });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'See our plan at https://www.notion.so/team/Design-doc-abc123 for details.',
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const unavailable = body.intent.sources.filter((s: { status: string }) => s.status === 'unavailable');
    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable.some((s: { ref: string | null }) => s.ref?.includes('notion.so'))).toBe(true);

    // The user message sent to the classifier must say the reference was NOT
    // read, and must never carry a "Referenced documents" section built from
    // it (there is no Notion content to have leaked — this pins that no
    // fabricated content is ever synthesized for an unreachable reference).
    const userMsg = (llm.calls[0]!.req as { messages: { role: string; content: string }[] }).messages[1]!.content;
    expect(userMsg).toContain('were NOT read');
    expect(userMsg).not.toContain('## Referenced documents');

    await app.close();
  });

  it('reads an in-repo plan doc via readFileAt at the PR head, and its content reaches the classifier', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: FIXTURE } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'See the plan at docs/plans/p.md for details.',
    });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({
          filesAt: { [`${pr.headSha}:docs/plans/p.md`]: '# Plan\n\nRate limiting rollout.' },
        }),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
        llm: { openrouter: llm },
      },
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const used = body.intent.sources.filter((s: { status: string }) => s.status === 'used');
    expect(
      used.some(
        (s: { kind: string; ref: string | null }) => s.kind === 'plan' && s.ref?.includes('docs/plans/p.md'),
      ),
    ).toBe(true);

    const userMsg = (llm.calls[0]!.req as { messages: { role: string; content: string }[] }).messages[1]!.content;
    expect(userMsg).toContain('Rate limiting rollout');

    await app.close();
  });

  it('no key configured for the default provider → skipped, not an error, still HTTP 200', async () => {
    const app = await appWith({ openrouter: null });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toBeNull();
    expect(body.skipped).toContain('no openrouter API key configured');

    await app.close();
  });

  it('an unknown PR id 404s', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/intent` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('never leaks a diff hunk BODY line into the classifier prompt — only @@ header lines survive', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: FIXTURE } });
    const app = await appWith({ openrouter: llm });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // git.diff() is empty (see appWith), so the service reconstructs the file
    // list from `pr_files.patch` — the path this test targets.
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+SECRET_BODY_LINE\n   redisUrl: x,',
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);

    const userMsg = (llm.calls[0]!.req as { messages: { role: string; content: string }[] }).messages[1]!.content;
    expect(userMsg).not.toContain('SECRET_BODY_LINE');
    expect(userMsg).toContain('@@ -10,3 +10,4 @@');

    await app.close();
  });
});
