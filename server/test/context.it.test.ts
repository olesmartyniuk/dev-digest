import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

/**
 * Project Context (L05) end to end: a real clone on disk with fixture `.md`
 * files, the attachment tables, and run-time resolution. Covers AC-2/3/9/12a/
 * 13/15/16/17/18 — see specs/SPEC-01-project-context.md.
 */
d('context', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clonePath: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    const ids = await seed(pg.handle.db);
    workspaceId = ids.workspaceId;

    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-context-it-'));
    await mkdir(join(clonePath, 'docs'), { recursive: true });
    await writeFile(join(clonePath, 'docs', 'a.md'), 'Rule A content.', 'utf8');
    await writeFile(join(clonePath, 'docs', 'b.md'), 'Rule B content.', 'utf8');

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'context-fixture',
        fullName: 'acme/context-fixture',
        clonePath,
      })
      .returning();
    repoId = repo!.id;
  });

  afterAll(async () => {
    await pg?.stop();
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Context Agent ${Date.now()}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
    });
    return res.json();
  }

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, type: 'rubric', body: '# Rubric' },
    });
    return res.json();
  }

  it('GET /repos/:id/context lists .md documents sorted, and used_by updates after attaching', async () => {
    const app = await makeApp();
    const listed = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(listed.statusCode).toBe(200);
    const listing = listed.json();
    expect(listing.clone_status).toBe('ready');
    const paths = listing.documents.map((d: { path: string }) => d.path);
    expect(paths).toEqual(['docs/a.md', 'docs/b.md']);
    const before = listing.documents.find((doc: { path: string }) => doc.path === 'docs/a.md');
    expect(before.used_by).toEqual({ agents: 0, skills: 0 });

    const agent = await createAgent(app);
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/a.md'] },
    });

    // used_by is ALWAYS queried live (D8) — a plain re-GET (cache hit) already
    // reflects the new attachment, no rescan needed.
    const refreshed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json();
    const afterDoc = refreshed.documents.find((doc: { path: string }) => doc.path === 'docs/a.md');
    expect(afterDoc.used_by).toEqual({ agents: 1, skills: 0 });
    await app.close();
  });

  it('returns clone_status:not_cloned with 200 (not an error) when the repo has no clone yet', async () => {
    const app = await makeApp();
    const [noClone] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'no-clone', fullName: 'acme/no-clone', clonePath: null })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/repos/${noClone!.id}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ clone_status: 'not_cloned', documents: [], scanned_at: null });
    await app.close();
  });

  it('PUT /agents/:id/context rejects a traversal path and a path with no configured root', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const traversal = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['../x.md'] },
    });
    expect(traversal.statusCode).toBe(422);

    const unrooted = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['src/a.md'] },
    });
    expect(unrooted.statusCode).toBe(422);
    await app.close();
  });

  it('GET /agents/:id/context shows inherited + effective after linking a skill; a disabled skill is excluded from effective', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const skill = await createSkill(app, `Context Skill ${Date.now()}`);

    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['docs/b.md'] },
    });
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/a.md'] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id },
    });

    const withEnabledSkill = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/context` })
    ).json();
    expect(withEnabledSkill.paths).toEqual(['docs/a.md']);
    expect(withEnabledSkill.inherited).toEqual([
      { skill_id: skill.id, skill_name: skill.name, enabled: true, paths: ['docs/b.md'] },
    ]);
    expect(withEnabledSkill.effective).toEqual(['docs/b.md', 'docs/a.md']);

    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } });
    const withDisabledSkill = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/context` })
    ).json();
    expect(withDisabledSkill.inherited).toEqual([
      { skill_id: skill.id, skill_name: skill.name, enabled: false, paths: ['docs/b.md'] },
    ]);
    // Excluded from EFFECTIVE (run-time order) — still LISTED (inherited keeps every link).
    expect(withDisabledSkill.effective).toEqual(['docs/a.md']);
    await app.close();
  });

  it('GET /skills/:id/context/preview returns the serialized Project context block (AC-9)', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, `Preview Skill ${Date.now()}`);
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['docs/a.md'] },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/skills/${skill.id}/context/preview?repo_id=${repoId}`,
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview.clone_status).toBe('ready');
    expect(preview.text).toContain('## Project context');
    expect(preview.text).toContain('<untrusted source="spec-0">');
    expect(preview.text).toContain('Source: docs/a.md');
    expect(preview.paths).toEqual(['docs/a.md']);
    expect(preview.truncated).toBe(false);
    await app.close();
  });

  it('deleting an agent cascades its attached context rows', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/a.md'] },
    });
    const before = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agent.id));
    expect(before.length).toBe(1);

    await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` });

    const after = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agent.id));
    expect(after.length).toBe(0);
    await app.close();
  });

  it('GET /repos/:id/context/file returns a document\'s raw content', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=docs/a.md`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ path: 'docs/a.md', content: 'Rule A content.' });
    await app.close();
  });

  it('GET /repos/:id/context/file rejects an unattachable path (422) and 404s a path that is attachable but missing', async () => {
    const app = await makeApp();
    const unrooted = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=src/a.md`,
    });
    expect(unrooted.statusCode).toBe(422);

    const missing = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=docs/does-not-exist.md`,
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('returns clone_status:missing (still 200) when clonePath is set but the directory is gone from disk', async () => {
    const app = await makeApp();
    const goneClonePath = join(clonePath, 'this-directory-does-not-exist');
    const [goneRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'gone-clone', fullName: 'acme/gone-clone', clonePath: goneClonePath })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/repos/${goneRepo!.id}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ clone_status: 'missing', documents: [], scanned_at: null });
    await app.close();
  });

  it('POST /repos/:id/context/rescan forces a fresh scan — a new document on disk is invisible to a cached GET but appears after rescan', async () => {
    const app = await makeApp();
    const freshClonePath = await mkdtemp(join(tmpdir(), 'devdigest-context-rescan-'));
    try {
      await mkdir(join(freshClonePath, 'docs'), { recursive: true });
      await writeFile(join(freshClonePath, 'docs', 'first.md'), 'First.', 'utf8');
      const [rescanRepo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'rescan-fixture', fullName: 'acme/rescan-fixture', clonePath: freshClonePath })
        .returning();

      // Populate the in-memory cache (D8).
      const initial = (await app.inject({ method: 'GET', url: `/repos/${rescanRepo!.id}/context` })).json();
      expect(initial.documents.map((d: { path: string }) => d.path)).toEqual(['docs/first.md']);

      // A document added to the clone after the scan — a plain GET must still
      // serve the stale cache (D8: never auto-rescans on every request).
      await writeFile(join(freshClonePath, 'docs', 'second.md'), 'Second.', 'utf8');
      const stillCached = (await app.inject({ method: 'GET', url: `/repos/${rescanRepo!.id}/context` })).json();
      expect(stillCached.documents.map((d: { path: string }) => d.path)).toEqual(['docs/first.md']);

      // Forcing a rescan picks it up.
      const rescanned = (await app.inject({ method: 'POST', url: `/repos/${rescanRepo!.id}/context/rescan` })).json();
      expect(rescanned.documents.map((d: { path: string }) => d.path)).toEqual(['docs/first.md', 'docs/second.md']);
    } finally {
      await rm(freshClonePath, { recursive: true, force: true });
      await app.close();
    }
  });

  it('PUT /agents/:id/context rejects duplicate paths (422) via the shared Zod contract', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/a.md', 'docs/a.md'] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('GET and PUT /agents/:id/context 404 for an unknown agent id', async () => {
    const app = await makeApp();
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const getRes = await app.inject({ method: 'GET', url: `/agents/${unknownId}/context` });
    expect(getRes.statusCode).toBe(404);
    const putRes = await app.inject({
      method: 'PUT',
      url: `/agents/${unknownId}/context`,
      payload: { paths: ['docs/a.md'] },
    });
    expect(putRes.statusCode).toBe(404);
    await app.close();
  });

  it('GET /skills/:id/context/preview degrades to clone_status:not_cloned (not an error) when the preview repo has no clone', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, `No-clone Preview Skill ${Date.now()}`);
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['docs/a.md'] },
    });
    const [noCloneRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'preview-no-clone', fullName: 'acme/preview-no-clone', clonePath: null })
      .returning();

    const res = await app.inject({
      method: 'GET',
      url: `/skills/${skill.id}/context/preview?repo_id=${noCloneRepo!.id}`,
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview).toMatchObject({ clone_status: 'not_cloned', text: null, paths: [], truncated: false });
    expect(preview.missing).toEqual(['docs/a.md']);
    await app.close();
  });
});
