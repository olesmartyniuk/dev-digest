# Onion Architecture — Examples

Real good examples are pulled from the codebase as it stands; bad examples are constructed to show the violation `pnpm arch` would catch.

## Application layer depends on the port, not the adapter

**Good** — [`modules/repos/service.ts`](../../../server/src/modules/repos/service.ts): `RepoService` calls `this.container.git.clone(...)` and `this.container.secrets.get(...)`. It never imports `SimpleGitClient` or `LocalSecretsProvider`. Swapping the git implementation, or injecting a mock in tests via `ContainerOverrides`, needs zero changes here.

```ts
export class RepoService {
  constructor(private container: Container) {}

  async runCloneJob(payload: CloneJobPayload): Promise<void> {
    const token = await this.container.secrets.get(GITHUB_TOKEN_SECRET);
    const { path } = await this.container.git.clone({ owner, name }, cloneUrl, { depth: CLONE_DEPTH });
    await this.repo.updateClonePath(repoId, path);
  }
}
```

**Bad** — constructing or importing the concrete adapter inside a service:

```ts
// service.ts
import { SimpleGitClient } from '../../adapters/git/simple-git.js'; // ✗ no-service-imports-adapters-directly

export class RepoService {
  private git = new SimpleGitClient(this.config.cloneDir); // ✗ bypasses Container, untestable without a real clone
}
```

This is a **real, currently-baselined** violation in the repo: `modules/repo-intel/service.ts` imports `adapters/codeindex/extract.js` and `adapters/astgrep/index.js` directly instead of going through `Container`. It's frozen in `.dependency-cruiser-known-violations.json`, not something to copy for new code.

## SQL stays in the repository

**Good** — [`modules/repos/repository.ts`](../../../server/src/modules/repos/repository.ts) / [`modules/reviews/repository/*.ts`](../../../server/src/modules/reviews/repository/): all `drizzle-orm` imports and query-building live here. `service.ts` calls `this.repo.findByFullName(...)`, `this.repo.insert(...)` — plain method calls, no `eq()`/`sql` in sight.

**Bad** — a route or service running a query inline:

```ts
// routes.ts or service.ts
import { eq } from 'drizzle-orm'; // ✗ no-sql-outside-persistence
const rows = await container.db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
```

This is also a **real, currently-baselined** violation: `modules/settings/feature-models.ts` queries `t.settings` directly with `eq(...)` instead of through a `repository.ts` (the `settings` module doesn't have one yet). Don't add a second file that does the same thing — either route new settings queries through a proper repository, or extend the existing pattern deliberately, not by accident.

## Routes stay thin

**Good** — [`modules/reviews/routes.ts`](../../../server/src/modules/reviews/routes.ts): every handler is parse → one `service.<method>()` call → shape the response. No branching business logic, no direct repository/adapter access.

```ts
app.post('/pulls/:id/review', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const body = RunRequest.parse(req.body ?? {});
  const targets = await service.resolveTargets(workspaceId, body);
  const { runs, reviews } = await service.runReview(workspaceId, req.params.id, targets, req.log);
  return { pr_id: req.params.id, runs, reviews };
});
```

**Bad** — a route that decides things:

```ts
app.post('/pulls/:id/review', async (req) => {
  const agents = await container.agentsRepo.listEnabled(workspaceId); // ✗ business logic + repo access in routes.ts
  if (agents.length === 0) { /* ... */ }
  for (const agent of agents) { /* orchestration that belongs in service.ts */ }
});
```

## Cross-module access goes through the Container

**Good** — `container.agentsRepo`, `container.reviewRepo`, `container.repoIntel` are constructed once in `platform/container.ts` and consumed by any module that needs them.

**Bad**, and again a **real, currently-baselined** violation: `modules/repos/service.ts` imports `../repo-intel/constants.js` directly for `INDEX_JOB_KIND`/`REFRESH_JOB_KIND` instead of that value being exposed through `Container` or `@devdigest/shared`. Small (it's just string literals), but it's exactly the kind of import that turns into a real coupling problem once `repo-intel`'s internals change shape.

## Domain files stay pure

**Good**: every module's `helpers.ts`/`constants.ts` in this repo currently imports none of `fastify`, `drizzle-orm`, `postgres`, `adapters/`, or `Container` — that's the rule already holding with zero violations, which `pnpm arch`'s `no-domain-outward` rule locks in going forward.

**Bad** — a "helper" that quietly becomes infrastructure:

```ts
// helpers.ts
import { eq } from 'drizzle-orm'; // ✗ no-domain-outward — this makes it a repository, name/move it accordingly
export function toRepoDto(row: RepoRow, db: Db) { ... }
```
