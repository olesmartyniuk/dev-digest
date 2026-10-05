import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  console.warn('[brief] Docker not available — skipping integration tests.');
}

/** 3 risks (low, high, medium-with-invented-path) + 3 focus entries (one invented). */
const FIXTURE = {
  summary: 'This PR adds rate limiting to the public API to prevent abuse from unauthenticated clients.',
  risks: [
    {
      kind: 'perf',
      title: 'Minor overhead from the limiter',
      explanation: 'The token bucket adds a small per-request cost.',
      severity: 'low',
      file_refs: ['src/middleware/ratelimit.ts'],
    },
    {
      kind: 'security',
      title: 'Hardcoded secret key',
      explanation: 'A live Stripe key is committed in plaintext.',
      severity: 'high',
      file_refs: ['src/config.ts'],
    },
    {
      kind: 'correctness',
      title: 'Invented-path risk',
      explanation: 'References a file that does not exist in this PR.',
      severity: 'medium',
      file_refs: ['src/invented-file.ts'],
    },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 12, reason: 'Hardcoded secret — start here.' },
    { file: 'src/invented-file.ts', line: 1, reason: 'Invented path.' },
    { file: 'src/middleware/ratelimit.ts', line: 1, reason: 'Core logic of the change.' },
  ],
};

/** Fails `RiskBrief` — missing every required field but `summary`. */
const BROKEN_FIXTURE = { summary: 'x' };

/** repo-intel stub: only `getBlastRadius`, the one method BlastService reads. */
function stubRepoIntel(opts: { degraded?: boolean } = {}): RepoIntel {
  return {
    getBlastRadius: async () => {
      if (opts.degraded) throw new Error('index broken');
      return {
        changedSymbols: [{ file: 'src/config.ts', name: 'loadConfig', kind: 'function' }],
        callers: [{ file: 'src/caller.ts', symbol: 'useConfig', viaSymbol: 'loadConfig', line: 7, rank: 1 }],
        impactedEndpoints: [],
        degraded: false,
      };
    },
  } as unknown as RepoIntel;
}

d('brief', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let pullId: string;
  let pullHeadSha: string;
  let pullTitle: string;

  beforeAll(async () => {
    pg = await startPg();
    const ids = await seed(pg.handle.db);
    workspaceId = ids.workspaceId;

    const [pull] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.number, 482)));
    pullId = pull!.id;
    pullHeadSha = pull!.headSha;
    // The seeded title ("Add rate limiting to public API endpoints") is a
    // literal substring of the seeded (legitimately-included) description, so
    // asserting its absence from the prompt would pass or fail for the wrong
    // reason. Give the row a title that shares no text with the description,
    // so "the title never reaches the model" is a real, falsifiable check.
    pullTitle = 'TITLE_ONLY_MARKER_PR_482_NEVER_SENT';
    await pg.handle.db.update(t.pullRequests).set({ title: pullTitle }).where(eq(t.pullRequests.id, pullId));

    // The seeded pr_files carry no patch — give them one, so we can assert it
    // never reaches the prompt (D7 / AC-2).
    await pg.handle.db
      .update(t.prFiles)
      .set({ patch: 'PATCH_BODY_MARKER_123' })
      .where(eq(t.prFiles.prId, pullId));
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(opts: { fixture?: unknown; degradedBlast?: boolean } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { RiskBrief: opts.fixture ?? FIXTURE },
    });
    const app = buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
        llm: { openai: llm },
        repoIntel: stubRepoIntel({ degraded: opts.degradedBlast }),
      },
    });
    return { app, llm };
  }

  it('1. GET before generate returns {brief:null} and makes 0 LLM calls', async () => {
    const { app, llm } = makeApp();
    const built = await app;
    const res = await built.inject({ method: 'GET', url: `/pulls/${pullId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null });
    expect(llm.calls).toHaveLength(0);
    await built.close();
  });

  it('2. POST generates, calls the LLM exactly once, drops the invented entries, sorts risks by severity', async () => {
    const { app, llm } = makeApp();
    const built = await app;
    const res = await built.inject({ method: 'POST', url: `/pulls/${pullId}/brief` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);
    const req = structuredCalls[0]!.req as { model: string; messages: { content: string }[] };
    expect(req.model).toBe('gpt-4.1');
    const serialized = JSON.stringify(req.messages);
    expect(serialized).not.toContain('PATCH_BODY_MARKER_123');
    // D7 — the real PR title (a genuine, falsifiable value from the seeded
    // row) must never reach the model either.
    expect(serialized).not.toContain(pullTitle);

    expect(body.brief.risks.map((r: { severity: string }) => r.severity)).toEqual(['high', 'low']);
    expect(body.brief.risks.some((r: { file_refs: string[] }) => r.file_refs.includes('src/invented-file.ts'))).toBe(
      false,
    );
    expect(body.brief.review_focus.map((f: { file: string }) => f.file)).toEqual([
      'src/config.ts',
      'src/middleware/ratelimit.ts',
    ]);
    expect(body.brief.head_sha).toBe(pullHeadSha);

    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pullId));
    expect(rows).toHaveLength(1);
    // The stored row itself — not just the HTTP response — carries the head_sha (AC-3).
    expect((rows[0]!.json as { head_sha: string }).head_sha).toBe(pullHeadSha);
    await built.close();
  });

  it('3. GET after a head-SHA change still serves the cached brief with no new LLM call (AC-9)', async () => {
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'deadbeef0000' })
      .where(eq(t.pullRequests.id, pullId));

    const { app, llm } = makeApp();
    const built = await app;
    const before = (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pullId)))[0]!;
    const res = await built.inject({ method: 'GET', url: `/pulls/${pullId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().brief.generated_at).toBe((before.json as { generated_at: string }).generated_at);
    expect(res.json().brief.head_sha).toBe(pullHeadSha); // the OLD sha, bookkeeping only
    expect(llm.calls).toHaveLength(0);
    await built.close();

    // restore the head sha for the remaining cases
    await pg.handle.db.update(t.pullRequests).set({ headSha: pullHeadSha }).where(eq(t.pullRequests.id, pullId));
  });

  it('4. a subsequent failed generation (bad schema) returns 502 and leaves the stored row untouched (AC-12)', async () => {
    const before = (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pullId)))[0]!;

    const { app } = makeApp({ fixture: BROKEN_FIXTURE });
    const built = await app;
    const res = await built.inject({ method: 'POST', url: `/pulls/${pullId}/brief` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('external_service_error');

    const after = (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pullId)))[0]!;
    expect(after.json).toEqual(before.json);
    await built.close();
  });

  it('5. with no pr_intent row and a degraded blast stub, POST returns missing_sources: [intent, blast]', async () => {
    const { app } = makeApp({ degradedBlast: true });
    const built = await app;
    const res = await built.inject({ method: 'POST', url: `/pulls/${pullId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().brief.missing_sources).toEqual(['intent', 'blast']);
    await built.close();
  });

  it('6. uses the workspace feature-model override instead of the registry default', async () => {
    const { app, llm } = makeApp();
    const built = await app;

    const put = await built.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openai', model: 'gpt-override' } } },
    });
    expect(put.statusCode).toBe(200);

    const res = await built.inject({ method: 'POST', url: `/pulls/${pullId}/brief` });
    expect(res.statusCode).toBe(200);
    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);
    expect((structuredCalls[0]!.req as { model: string }).model).toBe('gpt-override');
    await built.close();
  });

  it('7. attaches project context (union of effective paths of agents already reviewed, or every enabled agent)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'devdigest-brief-'));
    await mkdir(join(clonePath, 'docs'), { recursive: true });
    const marker = 'PROJECT_CONTEXT_MARKER_XYZ';
    await writeFile(join(clonePath, 'docs', 'guide.md'), `# Guide\n${marker}\n`, 'utf8');

    const [pull] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pullId));
    await pg.handle.db.update(t.repos).set({ clonePath }).where(eq(t.repos.id, pull!.repoId));

    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    await pg.handle.db
      .insert(t.agentContextDocs)
      .values({ agentId: agent!.id, path: 'docs/guide.md', order: 0 });

    const { app, llm } = makeApp();
    const built = await app;
    const res = await built.inject({ method: 'POST', url: `/pulls/${pullId}/brief` });
    expect(res.statusCode).toBe(200);

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    const req = structuredCalls[0]!.req as { messages: { content: string }[] };
    const userMessage = req.messages.map((m) => m.content).join('\n');
    // The marker must be INSIDE the context:0 untrusted wrapper specifically,
    // not merely present somewhere in the whole prompt.
    const wrapped = userMessage.match(/<untrusted source="context:0">([\s\S]*?)<\/untrusted>/);
    expect(wrapped).not.toBeNull();
    expect(wrapped![1]).toContain(marker);
    await built.close();

    await rm(clonePath, { recursive: true, force: true });
  });
});
