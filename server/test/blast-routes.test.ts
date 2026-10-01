import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import type { PullRow } from '../src/db/rows.js';
import type { RepoIntel, BlastResult } from '../src/modules/repo-intel/types.js';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Hermetic (no-DB) route tests for `GET /pulls/:id/blast`, following
 * `smart-diff-routes.test.ts`. `container.reviewRepo`'s memoized instance is
 * stubbed via `vi.spyOn`; `repoIntel` is injected through `ContainerOverrides`.
 * Only this test file may import `repo-intel/types.js` — `src/modules/blast/**`
 * may not (`no-cross-module-reach`).
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const PR_ID = '11111111-1111-1111-1111-111111111111';

function pullRow(): PullRow {
  return {
    id: PR_ID,
    workspaceId: 'w1',
    repoId: 'r1',
    number: 482,
    title: 'Add rate limiting',
    author: 'octocat',
    branch: 'feat/rate-limit',
    base: 'main',
    headSha: 'deadbeef',
    lastReviewedSha: null,
    additions: 0,
    deletions: 0,
    filesCount: 0,
    status: 'open',
    body: null,
    openedAt: null,
    updatedAt: null,
  } as PullRow;
}

/** repo-intel stub: only `getBlastRadius` is exercised by this feature. */
function stubRepoIntel(getBlastRadius: (repoId: string, files: string[]) => Promise<BlastResult>): RepoIntel {
  return { getBlastRadius } as unknown as RepoIntel;
}

describe('GET /pulls/:id/blast (no DB)', () => {
  let app: App | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  it('200s with grouped downstream, and getBlastRadius is called with (repoId, prFiles paths)', async () => {
    const getBlastRadius = vi.fn(
      async (): Promise<BlastResult> => ({
        changedSymbols: [{ file: 'a.ts', name: 'rateLimit', kind: 'function' }],
        callers: [{ file: 'b.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 1 }],
        impactedEndpoints: ['GET /x'],
        factsByFile: { 'b.ts': { endpoints: ['GET /x'], crons: [] } },
        degraded: false,
      }),
    );
    app = await buildApp({
      config,
      overrides: { auth: new MockAuthProvider(), repoIntel: stubRepoIntel(getBlastRadius) },
    });
    vi.spyOn(app.container.reviewRepo, 'getPull').mockResolvedValue(pullRow());
    vi.spyOn(app.container.reviewRepo, 'getPrFiles').mockResolvedValue([
      { id: 'f1', prId: PR_ID, path: 'a.ts', additions: 1, deletions: 0, patch: null },
      { id: 'f2', prId: PR_ID, path: 'b.ts', additions: 1, deletions: 0, patch: null },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_id).toBe(PR_ID);
    expect(body.downstream).toHaveLength(1);
    expect(body.downstream[0].symbol).toBe('rateLimit');
    expect(body.downstream[0].callers).toEqual([{ name: 'publicRouter', file: 'b.ts', line: 23 }]);
    expect(body.downstream[0].endpoints_affected).toEqual(['GET /x']);
    expect(body.degraded).toBe(false);
    expect(body.degraded_reason).toBeNull();
    expect(getBlastRadius).toHaveBeenCalledWith('r1', ['a.ts', 'b.ts']);
  });

  it('404s when the pull is unknown', async () => {
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });
    vi.spyOn(app.container.reviewRepo, 'getPull').mockResolvedValue(undefined);

    const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/blast` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });

  it('getBlastRadius rejecting still 200s, degraded with index_failed and no downstream', async () => {
    const getBlastRadius = vi.fn(async (): Promise<BlastResult> => {
      throw new Error('index is broken');
    });
    app = await buildApp({
      config,
      overrides: { auth: new MockAuthProvider(), repoIntel: stubRepoIntel(getBlastRadius) },
    });
    vi.spyOn(app.container.reviewRepo, 'getPull').mockResolvedValue(pullRow());
    vi.spyOn(app.container.reviewRepo, 'getPrFiles').mockResolvedValue([
      { id: 'f1', prId: PR_ID, path: 'a.ts', additions: 1, deletions: 0, patch: null },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.degraded).toBe(true);
    expect(body.degraded_reason).toBe('index_failed');
    expect(body.downstream).toEqual([]);
  });

  it('422s on a non-uuid id', async () => {
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });

    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });
});
