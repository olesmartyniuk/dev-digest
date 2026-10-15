# onion-architecture — evals

Regression evals for the `onion-architecture` skill. Each eval is an architecture-review task over a small fixture module with **real violations and no comments hinting at them** (eval 7 is a clean control).

Machine-readable source of truth: [evals.json](evals.json) (skill-creator schema: `id`, `prompt`, `expected_output`, `files`, `expectations`). The eval names below are the `eval_name` to use in `eval_metadata.json`. Fixtures: [files/](files/). Paths in prompts are relative to the skill directory.

## How to run
For each eval run the prompt twice — once with the skill available, once without — and grade the saved review against the assertions. Compare pass rates; the skill should score at least as high as the baseline on every eval.

Baseline hygiene: the no-skill run must not read `.claude/skills/` or `server/.dependency-cruiser*`, otherwise it can copy the rules.

Last result (2 iterations, one run each): with skill 100%, without ≈89–92%. The skill's edge is vocabulary and recipes (rule names, the new-port recipe, "`pnpm arch` cannot see this"), not raw detection.

## 1. service-with-sql-and-concrete-adapter

**Fixture:** `evals/files/service-with-sql-and-concrete-adapter`

**Prompt**
> Review the server module in evals/files/service-with-sql-and-concrete-adapter/src/modules/digest/ for this repo's backend (devdigest, server/). Tell me what is wrong from an architecture/layering standpoint, with severity, and how to fix each issue. If it is fine, say so. Do not edit the files.

**Expected findings**
Flags drizzle query + insert inline in service.ts (no-sql-outside-persistence, move to repository.ts), direct import/construction of GithubRestClient/Octokit in service (no-service-imports-adapters-directly; use container.github()), process.env read in service.

**Assertions**
- [ ] Flags inline Drizzle query/insert in service.ts as a violation and says to move it to repository.ts
- [ ] Flags direct import/construction of the concrete GitHub adapter (GithubRestClient) in service.ts and says to use container.github() / the port
- [ ] Flags `new Octokit(...)` (vendor SDK) inside the service
- [ ] Flags process.env read inside the service (secrets via SecretsProvider/Container)
- [ ] Names the dependency-cruiser rule(s) or `pnpm arch` as the mechanical check
- [ ] Assigns explicit severity levels to findings

## 2. domain-helpers-and-cross-module-reach

**Fixture:** `evals/files/domain-helpers-and-cross-module-reach`

**Prompt**
> Review the server module in evals/files/domain-helpers-and-cross-module-reach/src/modules/triage/ for this repo's backend (devdigest, server/). Tell me what is wrong from an architecture/layering standpoint, with severity, and how to fix each issue. If it is fine, say so. Do not edit the files.

**Expected findings**
Flags helpers.ts importing drizzle-orm, fastify and Container (no-domain-outward, CRITICAL; DB access belongs in repository.ts, request parsing in routes/_shared), and service.ts importing ../reviews/repository.js and ../agents/service.js (no-cross-module-reach; use container.reviewRepo / container.agentsRepo).

**Assertions**
- [ ] Flags helpers.ts importing drizzle-orm and running a DB query as a CRITICAL dependency-rule violation (no-domain-outward)
- [ ] Flags helpers.ts importing fastify / handling FastifyRequest
- [ ] Flags helpers.ts importing Container
- [ ] Flags service.ts importing ../reviews/repository.js and ../agents/service.js as cross-module reach, fix via container.reviewRepo / container.agentsRepo
- [ ] Notes service constructing another module's repository/service itself instead of via Container
- [ ] Names the dependency-cruiser rule(s) or `pnpm arch`

## 3. fat-route-with-sql-and-business-rules

**Fixture:** `evals/files/fat-route-with-sql-and-business-rules`

**Prompt**
> Review the server module in evals/files/fat-route-with-sql-and-business-rules/src/modules/labels/ for this repo's backend (devdigest, server/). Tell me what is wrong from an architecture/layering standpoint, with severity, and how to fix each issue. If it is fine, say so. Do not edit the files.

**Expected findings**
Flags routes.ts containing SQL (drizzle) and business rules (name normalisation, reserved names, max 10 labels) -> move to repository.ts / service.ts / helpers.ts+constants.ts; routes should be thin: Zod schema, one service call; no module service/repository exists; magic literals should be in constants.ts; `app as any` container access.

**Assertions**
- [ ] Flags SQL/Drizzle queries inside routes.ts and says to move to repository.ts
- [ ] Flags business rules (name normalisation, reserved names, 10-label limit) in the route and says to move to service.ts/helpers.ts
- [ ] States the route should be thin: Zod parse, one service call, return
- [ ] Flags magic literals (24, 10, '#888888', reserved regex) and says to put in constants.ts
- [ ] Notes missing service.ts/repository.ts for the module (module shape routes->service->repository)
- [ ] Names the dependency-cruiser rule(s) or `pnpm arch`

## 4. db-access-bypassing-import-rules

**Fixture:** `evals/files/db-access-bypassing-import-rules`

**Prompt**
> Review the server module in evals/files/db-access-bypassing-import-rules/src/modules/stale/ for this repo's backend (devdigest, server/). Tell me what is wrong from an architecture/layering standpoint, with severity, and how to fix each issue. If it is fine, say so. Do not edit the files.

**Expected findings**
Flags container.db.query / container.db.execute used directly in service.ts (SQL/persistence leak even though no drizzle-orm import, so pnpm arch will NOT catch it); raw string-interpolated SQL in close() as injection risk; fix via repository.ts.

**Assertions**
- [ ] Flags container.db.query.pulls.findMany in service.ts as persistence leaking into the application layer, fix: move to repository.ts
- [ ] Flags container.db.execute in close() as DB access in the service too
- [ ] Flags the string-interpolated SQL in close() as a SQL injection risk
- [ ] Points out that `pnpm arch`/no-sql-outside-persistence would NOT catch this because service.ts imports no drizzle-orm (rule is import-based)
- [ ] Proposes a repository.ts (and cross-module access to pulls via Container/an existing repo) as the fix
- [ ] Assigns explicit severity levels

## 5. new-integration-without-port

**Fixture:** `evals/files/new-integration-without-port`

**Prompt**
> Review the server module in evals/files/new-integration-without-port/src/modules/notify/ for this repo's backend (devdigest, server/). Tell me what is wrong from an architecture/layering standpoint, with severity, and how to fix each issue. If it is fine, say so. Do not edit the files.

**Expected findings**
Flags direct fetch to Slack + process.env webhook in service; fix by adding an interface (port) to shared adapters.ts (both vendored copies), implementation in adapters/slack/, Container getter with test override, service uses container.<x>; secrets via SecretsProvider.

**Assertions**
- [ ] Flags direct fetch to the Slack webhook in service.ts as an external call that bypasses the ports/Container
- [ ] Recommends adding an interface (port) in shared adapters.ts and mentions the vendored copies (server and client)
- [ ] Recommends implementation under adapters/<name>/ and a lazily-built Container getter with a test override slot
- [ ] Says service should consume it via this.container.<x> and never import the adapter class
- [ ] Flags process.env.SLACK_WEBHOOK_URL read inside the service (secrets via SecretsProvider/config)
- [ ] Assigns explicit severity levels

## 6. cycle-cross-module-and-env-switch

**Fixture:** `evals/files/cycle-cross-module-and-env-switch`

**Prompt**
> Review the server modules (folders rollup/ and blast/) in evals/files/cycle-cross-module-and-env-switch/src/modules/ for this repo's backend (devdigest, server/). Tell me what is wrong from an architecture/layering standpoint, with severity, and how to fix each issue. If it is fine, say so. Do not edit the files.

**Expected findings**
Flags import cycle rollup<->blast (rollup/service -> blast/helpers -> rollup/constants), cross-module reach into ../blast/helpers, vendor SDK constructed inline in service (new Anthropic) instead of container.llm(), NODE_ENV==='test' branching with fake client instead of ContainerOverrides, process.env keys; note pnpm arch no-circular/no-cross-module-reach.

**Assertions**
- [ ] Detects the import cycle rollup/service -> blast/helpers -> rollup/constants
- [ ] Flags blast/helpers.ts importing ../rollup/constants.js (cross-module reach) and service importing ../blast/helpers.js
- [ ] Flags `new Anthropic` (vendor SDK) constructed inside the service, fix: container.llm()/LLMProvider port
- [ ] Flags NODE_ENV==='test' branching with an inline fake, fix: inject mock via ContainerOverrides
- [ ] Flags process.env.ANTHROPIC_API_KEY read in the service
- [ ] Names dependency-cruiser rules (no-circular / no-cross-module-reach) or `pnpm arch`

## 7. clean-module-control

**Fixture:** `evals/files/clean-module-control`

**Prompt**
> Review the server module in evals/files/clean-module-control/src/modules/pins/ for this repo's backend (devdigest, server/). Tell me what is wrong from an architecture/layering standpoint, with severity, and how to fix each issue. If it is fine, say so. Do not edit the files.

**Expected findings**
Module is correctly layered. Reviewer should NOT report CRITICAL/HIGH layering violations; at most minor MEDIUM/LOW nits (e.g. unused exists(), service constructs its own repository per repo convention).

**Assertions**
- [ ] Does not report any CRITICAL or HIGH layering violation (no false positives on severity)
- [ ] States that the module follows the routes -> service -> repository layering / is fine architecturally
- [ ] Does not demand moving SQL, helpers or constants that are already in the right place
- [ ] Any raised nit is factually correct about the code (e.g. unused exists(), no invented imports)
- [ ] Does not recommend a large restructure of the module

