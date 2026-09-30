import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import type { PullRow } from '../src/db/rows.js';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Hermetic (no-DB) route tests for `GET /pulls/:id/smart-diff`, following the
 * `routes-smoke.test.ts` pattern. There is no `reviewRepo` override slot in
 * `ContainerOverrides`, so the memoized `container.reviewRepo` getter's
 * cached instance is stubbed directly via `vi.spyOn` — that IS the instance
 * the service resolves at request time (`container.ts:103-104`).
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

describe('GET /pulls/:id/smart-diff (no DB)', () => {
  let app: App | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  it('200s with files grouped by role, wiring omitted when absent, findings/pseudocode always empty', async () => {
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });
    vi.spyOn(app.container.reviewRepo, 'getPull').mockResolvedValue(pullRow());
    vi.spyOn(app.container.reviewRepo, 'getPrFiles').mockResolvedValue([
      // DB-shuffled order, on purpose.
      { id: 'f1', prId: PR_ID, path: 'src/a.ts', additions: 10, deletions: 2, patch: null },
      { id: 'f2', prId: PR_ID, path: 'pnpm-lock.yaml', additions: 300, deletions: 0, patch: null },
      { id: 'f3', prId: PR_ID, path: 'README.md', additions: 3, deletions: 0, patch: null },
      { id: 'f4', prId: PR_ID, path: 'src/a.test.ts', additions: 5, deletions: 1, patch: null },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groups.map((g: { role: string }) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 10 + 2 + 300 + 3 + 5 + 1, proposed_splits: [] });
    for (const g of body.groups) {
      for (const f of g.files) {
        expect(f.finding_lines).toEqual([]);
        expect(f.pseudocode_summary).toBeNull();
      }
    }
  });

  it('404s when the pull is unknown', async () => {
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });
    vi.spyOn(app.container.reviewRepo, 'getPull').mockResolvedValue(undefined);

    const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/smart-diff` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });

  it('422s on a non-uuid id', async () => {
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });

    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });
});
