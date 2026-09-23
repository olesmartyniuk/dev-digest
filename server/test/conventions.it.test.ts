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
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * Conventions Extractor end to end: a real clone on disk, a mocked model, and
 * the code-level evidence gate between them. The fixture deliberately has the
 * model propose one TRUE rule and one HALLUCINATED one, so every test here
 * asserts against a run where the gate had real work to do.
 */
d('conventions', () => {
  let pg: PgFixture;
  let clonePath: string;
  let workspaceId: string;
  let repoId: string;

  const USERS_TS = [
    'import { db } from "../db";',
    '',
    'export async function loadUser(id: string) {',
    '  const user = await db.users.find(id);',
    '  const posts = await db.posts.findMany({ userId: id });',
    '  return { user, posts };',
    '}',
  ].join('\n');

  /** One real rule (line 4 of users.ts) and one the file cannot support. */
  const MODEL_FIXTURE = {
    conventions: [
      {
        category: 'async',
        rule: 'Always use async/await instead of .then() chains.',
        rationale: 'Keeps control flow linear.',
        evidence_path: 'src/api/users.ts',
        evidence_line: 4,
        evidence_snippet: '  const user = await db.users.find(id);',
        confidence: 0.91,
      },
      {
        category: 'security',
        rule: 'Every request is authorised through requireSession().',
        rationale: 'Invented — this call appears nowhere in the sample.',
        evidence_path: 'src/api/users.ts',
        evidence_line: 2,
        evidence_snippet: 'await requireSession(req);',
        confidence: 0.88,
      },
    ],
  };

  beforeAll(async () => {
    pg = await startPg();
    const ids = await seed(pg.handle.db);
    workspaceId = ids.workspaceId;

    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-conventions-'));
    await mkdir(join(clonePath, 'src', 'api'), { recursive: true });
    await writeFile(join(clonePath, 'src', 'api', 'users.ts'), USERS_TS, 'utf8');
    // Two files big enough for the walker's 500-byte floor, so the top-up path
    // has something to find beyond whatever the index hands over.
    for (const name of ['orders.ts', 'invoices.ts']) {
      await writeFile(
        join(clonePath, 'src', 'api', name),
        `// ${name}\n${'export const pad = "filler";\n'.repeat(30)}`,
        'utf8',
      );
    }
    await writeFile(
      join(clonePath, 'tsconfig.json'),
      '{\n  "compilerOptions": {\n    "strict": true\n  }\n}',
      'utf8',
    );

    // The seed already owns `acme/payments-api`; point it at the fixture clone
    // rather than adding a second repo (the workspace has a unique full_name).
    const [repo] = await pg.handle.db
      .update(t.repos)
      .set({ clonePath })
      .where(
        and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')),
      )
      .returning();
    repoId = repo!.id;
  });

  afterAll(async () => {
    await pg?.stop();
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  /** repo-intel stub: only `getConventionSamples` is exercised by this feature. */
  function stubRepoIntel(paths: string[]): RepoIntel {
    return {
      getConventionSamples: async () => paths,
    } as unknown as RepoIntel;
  }

  function makeApp(opts: { samples?: string[]; fixture?: unknown } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { ConventionExtraction: opts.fixture ?? MODEL_FIXTURE },
    });
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({ OPENAI_API_KEY: 'sk-test' }),
        llm: { openai: llm },
        repoIntel: stubRepoIntel(opts.samples ?? ['src/api/users.ts']),
      },
    });
  }

  async function clearConventions() {
    await pg.handle.db.delete(t.conventions).where(eq(t.conventions.repoId, repoId));
  }

  describe('POST /repos/:id/conventions/extract', () => {
    it('keeps the evidenced rule and drops the hallucinated one', async () => {
      await clearConventions();
      const app = await makeApp();
      const res = await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/extract`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();

      const rules = body.conventions.map((c: { rule: string }) => c.rule);
      expect(rules).toContain('Always use async/await instead of .then() chains.');
      expect(rules).not.toContain('Every request is authorised through requireSession().');
      expect(body.drops).toContainEqual(
        expect.objectContaining({ reason: 'snippet_not_found' }),
      );
    });

    it('adds the config pass — a tsconfig rule nobody asked the model for', async () => {
      await clearConventions();
      const app = await makeApp();
      const body = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      const fromConfig = body.conventions.filter(
        (c: { origin: string }) => c.origin === 'config',
      );
      expect(fromConfig.length).toBeGreaterThan(0);
      expect(fromConfig[0]).toMatchObject({
        evidence: expect.objectContaining({ path: 'tsconfig.json' }),
      });
    });

    it('reports what it sampled and what it spent', async () => {
      await clearConventions();
      const app = await makeApp();
      const { stats } = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      expect(stats).toMatchObject({ sampled_files: 3, kept: expect.any(Number) });
      expect(stats.config_files).toBeGreaterThan(0);
      expect(stats.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('everything persisted starts pending', async () => {
      await clearConventions();
      const app = await makeApp();
      await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
      const rows = await pg.handle.db
        .select()
        .from(t.conventions)
        .where(eq(t.conventions.repoId, repoId));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.status === 'pending')).toBe(true);
    });

    it('a re-scan preserves a verdict and never re-asks for it', async () => {
      await clearConventions();
      const app = await makeApp();
      await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });

      const [row] = await pg.handle.db
        .select()
        .from(t.conventions)
        .where(
          and(
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.rule, 'Always use async/await instead of .then() chains.'),
          ),
        );
      await app.inject({
        method: 'PATCH',
        url: `/conventions/${row!.id}`,
        payload: { status: 'rejected' },
      });

      const second = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      const same = second.conventions.filter(
        (c: { rule: string }) => c.rule === 'Always use async/await instead of .then() chains.',
      );
      expect(same).toHaveLength(1);
      expect(same[0].status).toBe('rejected');
      expect(second.drops).toContainEqual(expect.objectContaining({ reason: 'already_judged' }));
    });

    it('still returns the config rules when no API key is configured', async () => {
      await clearConventions();
      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      const app = await buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          // No provider keys at all — the model pass cannot run.
          secrets: new MockSecretsProvider({}),
          repoIntel: stubRepoIntel(['src/api/users.ts']),
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/extract`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.stats.model).toBeNull();
      expect(body.stats.model_skipped).toContain('No LLM API key');
      // The tsconfig rule needs no model, so the scan is degraded, not empty.
      expect(body.conventions.length).toBeGreaterThan(0);
      expect(body.conventions.every((c: { origin: string }) => c.origin === 'config')).toBe(true);
    });

    it('tops the sample up from the clone when repo-intel ranked almost nothing', async () => {
      // The real case: repo-intel's indexer is TS/JS-only, so on a C# repo it
      // reports a "full" index holding one stray .js file. Trusting that count
      // fed the model a single file and produced zero conventions.
      await clearConventions();
      const app = await makeApp({ samples: ['src/api/users.ts'] });
      const { stats } = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      // users.ts from the index, plus the other fixture sources from the walk.
      expect(stats.sampled_files).toBeGreaterThan(1);
    });

    it('tops up when the index cites files that are no longer on disk', async () => {
      await clearConventions();
      const app = await makeApp({ samples: ['src/api/deleted-since-indexing.ts'] });
      const { stats } = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      // The count is measured on files actually READ, not paths returned.
      expect(stats.sampled_files).toBeGreaterThan(0);
    });

    it('names a clone that is missing from disk instead of reporting an empty repo', async () => {
      // `clone_path` is a DB column and `clones/` is git-ignored, so a stale
      // path outlives the folder routinely — the failure has to say so.
      const stale = join(clonePath, 'gone-missing');
      await pg.handle.db.update(t.repos).set({ clonePath: stale }).where(eq(t.repos.id, repoId));
      try {
        const app = await makeApp();
        const res = await app.inject({
          method: 'POST',
          url: `/repos/${repoId}/conventions/extract`,
        });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.message).toContain('missing from disk');
        expect(res.json().error.message).toContain('Refresh the repository');
      } finally {
        await pg.handle.db.update(t.repos).set({ clonePath }).where(eq(t.repos.id, repoId));
      }
    });

    it('404s for a repo in another workspace', async () => {
      const app = await makeApp();
      const res = await app.inject({
        method: 'POST',
        url: '/repos/00000000-0000-0000-0000-000000000000/conventions/extract',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /conventions/:id', () => {
    it('accepts, rejects, and edits the rule text', async () => {
      await clearConventions();
      const app = await makeApp();
      const extracted = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      const id = extracted.conventions[0].id;

      const accepted = await app.inject({
        method: 'PATCH',
        url: `/conventions/${id}`,
        payload: { status: 'accepted' },
      });
      expect(accepted.json()).toMatchObject({ status: 'accepted' });

      const edited = await app.inject({
        method: 'PATCH',
        url: `/conventions/${id}`,
        payload: { rule: 'Hand-written replacement rule for this repo.', category: 'structure' },
      });
      expect(edited.json()).toMatchObject({
        rule: 'Hand-written replacement rule for this repo.',
        category: 'structure',
        status: 'accepted',
      });
    });

    it('drops the model rationale when the rule is rewritten', async () => {
      await clearConventions();
      const app = await makeApp();
      const extracted = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      const withRationale = extracted.conventions.find(
        (c: { rationale: string | null }) => c.rationale,
      );
      expect(withRationale).toBeDefined();

      const res = await app.inject({
        method: 'PATCH',
        url: `/conventions/${withRationale.id}`,
        payload: { rule: 'A completely different house rule.' },
      });
      // The old rationale justified the old wording — keeping it would put a
      // contradiction straight into the skill body.
      expect(res.json()).toMatchObject({
        rule: 'A completely different house rule.',
        rationale: null,
      });
    });

    it('keeps a rationale the caller supplies alongside a new rule', async () => {
      await clearConventions();
      const app = await makeApp();
      const extracted = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      const res = await app.inject({
        method: 'PATCH',
        url: `/conventions/${extracted.conventions[0].id}`,
        payload: { rule: 'Another house rule.', rationale: 'Because we say so.' },
      });
      expect(res.json()).toMatchObject({ rationale: 'Because we say so.' });
    });

    it('422s on an empty patch', async () => {
      await clearConventions();
      const app = await makeApp();
      const extracted = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      const res = await app.inject({
        method: 'PATCH',
        url: `/conventions/${extracted.conventions[0].id}`,
        payload: {},
      });
      expect(res.statusCode).toBe(422);
    });

    it('404s for an unknown id', async () => {
      const app = await makeApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/conventions/00000000-0000-0000-0000-000000000000',
        payload: { status: 'accepted' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('skill promotion', () => {
    it('drafts a skill body from the accepted conventions only', async () => {
      await clearConventions();
      const app = await makeApp();
      const extracted = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      await app.inject({
        method: 'PATCH',
        url: `/conventions/${extracted.conventions[0].id}`,
        payload: { status: 'accepted' },
      });

      const draft = (
        await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })
      ).json();
      expect(draft).toMatchObject({ name: 'payments-api-conventions', type: 'convention' });
      expect(draft.convention_ids).toHaveLength(1);
      expect(draft.body).toContain(extracted.conventions[0].rule);
      expect(draft.body).toContain(`${extracted.conventions[0].evidence.path}:`);
    });

    it('saves the edited draft as an `extracted` skill and links it to an agent', async () => {
      await clearConventions();
      const app = await makeApp();
      const extracted = (
        await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
      ).json();
      await app.inject({
        method: 'PATCH',
        url: `/conventions/${extracted.conventions[0].id}`,
        payload: { status: 'accepted' },
      });
      const draft = (
        await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })
      ).json();

      const [agent] = await pg.handle.db.select().from(t.agents).limit(1);

      const created = await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill`,
        payload: {
          name: draft.name,
          description: draft.description,
          body: `${draft.body}\n<!-- edited by hand -->`,
          agent_ids: [agent!.id],
        },
      });
      expect(created.statusCode).toBe(201);
      const result = created.json();
      expect(result.skill).toMatchObject({
        name: 'payments-api-conventions',
        source: 'extracted',
        type: 'convention',
        enabled: true,
        version: 1,
      });
      expect(result.skill.body).toContain('<!-- edited by hand -->');
      expect(result.linked_agent_ids).toEqual([agent!.id]);

      const links = (
        await app.inject({ method: 'GET', url: `/agents/${agent!.id}/skills` })
      ).json();
      expect(links.some((l: { skill_id: string }) => l.skill_id === result.skill.id)).toBe(true);
    });
  });
});
