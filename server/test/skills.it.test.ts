import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + versioning (L02), and the pre-existing agent-side link surface
 * (`/agents/:id/skills`) round-tripped against a freshly-created skill.
 */
d('skills', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Coverage Rubric',
    type: 'rubric' as const,
    body: '# Rubric\nCheck branch coverage.',
  };

  describe('POST /skills', () => {
    it('creates a manual skill enabled by default, at version 1', async () => {
      const app = await makeApp();
      const res = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: 'Coverage Rubric',
        type: 'rubric',
        source: 'manual',
        body: createBody.body,
        enabled: true,
        version: 1,
      });
      await app.close();
    });

    it('an imported skill defaults to disabled pending vetting', async () => {
      const app = await makeApp();
      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'Imported Rubric', source: 'imported_url' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ source: 'imported_url', enabled: false });
      await app.close();
    });

    it('an explicit enabled overrides the source default', async () => {
      const app = await makeApp();
      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'Pre-vetted import', source: 'imported_url', enabled: true },
      });
      expect(res.json()).toMatchObject({ source: 'imported_url', enabled: true });
      await app.close();
    });
  });

  describe('PUT /skills/:id', () => {
    it('a body change bumps the version', async () => {
      const app = await makeApp();
      const skillId = (
        await app.inject({ method: 'POST', url: '/skills', payload: createBody })
      ).json().id as string;

      const updated = await app.inject({
        method: 'PUT',
        url: `/skills/${skillId}`,
        payload: { body: '# Rubric\nCheck branch AND edge-case coverage.' },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().version).toBe(2);
      await app.close();
    });

    it('a name/description/type/enabled-only change does NOT bump the version', async () => {
      const app = await makeApp();
      const skillId = (
        await app.inject({ method: 'POST', url: '/skills', payload: createBody })
      ).json().id as string;

      const updated = await app.inject({
        method: 'PUT',
        url: `/skills/${skillId}`,
        payload: { name: 'Renamed Rubric', enabled: false },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ name: 'Renamed Rubric', enabled: false, version: 1 });
      await app.close();
    });

    it('404s for an unknown skill', async () => {
      const app = await makeApp();
      const ghost = '00000000-0000-0000-0000-000000000000';
      const res = await app.inject({ method: 'PUT', url: `/skills/${ghost}`, payload: { enabled: false } });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe('DELETE /skills/:id', () => {
    it('deletes a skill', async () => {
      const app = await makeApp();
      const skillId = (
        await app.inject({ method: 'POST', url: '/skills', payload: createBody })
      ).json().id as string;

      const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
      expect(del.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(404);
      await app.close();
    });
  });

  describe('/agents/:id/skills — link a freshly-created skill', () => {
    it('links, reorders, and unlinks via the existing agent-side surface', async () => {
      const app = await makeApp();
      const agentId = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: 'Linking Test Agent', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
        })
      ).json().id as string;
      const skillA = (
        await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name: 'Skill A' } })
      ).json().id as string;
      const skillB = (
        await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name: 'Skill B' } })
      ).json().id as string;

      // Link one at a time (append semantics).
      await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_id: skillA } });
      const afterFirst = await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_id: skillB } });
      expect(afterFirst.json()).toEqual([
        { agent_id: agentId, skill_id: skillA, order: 0 },
        { agent_id: agentId, skill_id: skillB, order: 1 },
      ]);

      // Reorder via the whole-list replace form.
      const reordered = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [skillB, skillA] },
      });
      expect(reordered.json()).toEqual([
        { agent_id: agentId, skill_id: skillB, order: 0 },
        { agent_id: agentId, skill_id: skillA, order: 1 },
      ]);

      // Unlink by omitting it from the replace list.
      const unlinked = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [skillA] },
      });
      expect(unlinked.json()).toEqual([{ agent_id: agentId, skill_id: skillA, order: 0 }]);
      await app.close();
    });
  });

  it('skills are workspace-scoped: another tenant cannot read or update them', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'skills-other' }).returning();
    const service = new SkillsService({ db } as unknown as Container);
    const foreign = await service.create(otherWs!.id, createBody);

    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    expect(await service.get(otherWs!.id, foreign.id)).toMatchObject({ id: foreign.id });
    expect(await service.get(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.update(defaultWs!, foreign.id, { enabled: false })).toBeUndefined();
    expect(await service.delete(defaultWs!, foreign.id)).toBe(false);
  });
});
