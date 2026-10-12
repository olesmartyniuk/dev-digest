# Plan — Eval Pipeline (regression protection for the review agent, L06)
**Spec:** `specs/eval-pipeline.md` (SPEC-04, status approved, D1–D9 resolved; verified in Step 0 — no `[NEEDS CLARIFICATION]` markers, every AC maps onto existing repo seams; one repo-vs-spec gap handled as Key decision K2 below)
**Request:** Implement SPEC-04 end to end: eval cases from accepted/dismissed findings, per-agent eval set (>= 8 seeded), background eval runs through `reviewPullRequest` on frozen inputs, LLM-free scoring in `reviewer-core`, run history, dashboards, two-run compare, and a `pnpm verify:l06` gate.
**Status:** READY FOR IMPLEMENTER
**Packages touched:** server · client · reviewer-core · shared (×2) · repo root (`package.json` + `scripts/verify-l06.mjs`)
**Out of scope:** Promote vN / rollback; "Run all agents"; "Run on save"; a "Files" input tab; 30-day range selector; Stats and CI tabs; Memory / Multi-Agent / Agent Performance / CI Runs sidebar items; skill-owned eval sets (`owner_kind: 'skill'`); LLM-as-judge; variance reduction; cancelling an eval run; e2e flow (spec marks it optional and non-gating, so no `e2e/specs/*` file is added); `devdigest-mcp/` exposure of eval data; changing `AgentsRepository`/seed so seeded agents get a v1 `agent_versions` snapshot; Learn / Reply finding actions (they don't exist in `FindingCard` today, see Risks).
**Sources read:** `specs/eval-pipeline.md`; root `CLAUDE.md`, `INSIGHTS.md`, `TESTING.md`, `specs/review-flow.md` (G1, S1, P1–P3, R1, R3, R6, K1, K3); `server/CLAUDE.md`, `server/INSIGHTS.md`; `client/CLAUDE.md`, `client/INSIGHTS.md`; `reviewer-core/CLAUDE.md`, `reviewer-core/INSIGHTS.md`; `server/src/db/schema/eval.ts`, `agents.ts`, `runs.ts`, `_shared.ts`, `db/schema.ts`, `db/rows.ts`, `db/seed.ts`; `server/drizzle.config.ts`; `server/package.json`; `server/.dependency-cruiser.cjs`; `server/src/app.ts`; `server/src/platform/container.ts`, `errors.ts`; `server/src/modules/index.ts`; `server/src/modules/reviews/{routes,service,run-executor,diff-loader,findings,repository}.ts`; `server/src/modules/agents/{routes,repository}.ts`; `server/src/modules/_shared/{context,schemas}.ts`; `server/src/adapters/mocks.ts`; `server/src/adapters/git/diff-parser.ts` (export list); `server/src/vendor/shared/{index.ts,adapters.ts,contracts/findings.ts,contracts/knowledge.ts,contracts/eval-ci.ts}` + client copies of `index.ts`/markers; `server/test/{reviews.it.test.ts,blast-routes.test.ts,helpers/pg.ts}`, `contracts.test.ts` (outline); `reviewer-core/src/{index.ts,grounding.ts,review/run.ts}`, `reviewer-core/package.json`, `reviewer-core/tsconfig.json` paths; `client/package.json`; `client/messages/en/eval.json`, `agents.json` (tabs), `shell.json` (nav); `client/src/i18n/request.ts`; `client/src/vendor/ui/nav.ts`, `primitives/Button.tsx`, `kit/Modal.tsx`, `kit/Checkbox.tsx`, `charts/{MetricCard,LineChart,Sparkline}.tsx`, `icons.tsx` (FlaskConical/BarChart/GitCompare grep); `client/src/components/app-shell/helpers.ts`; `client/src/lib/{api.ts,toast.tsx,hooks/index.ts,hooks/agents.ts,hooks/reviews.ts}`; `client/src/app/agents/[id]/{page.tsx,_hooks/useAgentTab.ts,_components/AgentEditor/{AgentEditor.tsx,constants.ts,AgentEditor.test.tsx}}`; `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/{FindingCard.tsx,FindingCard.test.tsx}` and its two call sites; `client/src/app/skills/page.tsx`; `.claude/skills/pr-self-review/SKILL.md` (Step 2 map), `.claude/skills/onion-architecture/SKILL.md`.

---

## Key decisions (expensive to reverse)

- **K1 — New batch table `eval_batches` + additive columns** (D1, AC-38). `eval_runs` gains a nullable `batch_id`; `eval_cases` gains `agent_id` (FK, cascade — gives the "agent deleted → cases cascade" edge case a real FK, since `owner_id` is polymorphic and can't carry one), `source_finding_id` (FK `set null`, unique → AC-5 dedupe at DB level) and `created_at`. All additive, so one non-interactive `pnpm db:generate` (server INSIGHTS 2026-09-23: drizzle-kit only turns interactive on drop+add in one diff).
- **K2 — Compare reads the system prompt from the run's own config snapshot, not `agent_versions`.** The spec's data model (line 108) says compare uses `agent_versions.config_json.system_prompt`. The repo contradicts that premise for the seeded agents: `seed.ts:247-253` inserts agents with `db.insert(t.agents)` directly, bypassing `AgentsRepository.insert` (`agents/repository.ts:85-106`), so **no v1 snapshot exists** for Security Reviewer, and `GET /agents/:id/versions/1` would 404 in the course's own demo (v1 → v2 compare). Each batch therefore stores `config_json = { provider, model, system_prompt, strategy, skill_ids }` read from the agent row at run start, plus `agent_version`. That *is* the snapshot of the version the run used (AC-11), and it can't go missing. No `agent_versions` read is needed anywhere in this plan.
- **K3 — Scoring lives in `reviewer-core/src/eval/score.ts`** as pure functions over plain data (no `LLMProvider` in any signature), exported from `reviewer-core/src/index.ts`. The server only calls it. "Survived the gate" = `ReviewOutcome.review.findings`, "dropped" = `ReviewOutcome.dropped.length`. The gate is never re-implemented (AC-21).
- **K4 — One active run per agent is enforced by a partial unique index** `eval_batches_one_running_per_agent ON eval_batches(agent_id) WHERE status = 'running'` (AC-18). Unique violation (`23505`) → 409. The DB guarantee closes the race that a check-then-insert would leave open.
- **K5 — The turn-into-case diff comes from the same loader reviews use**, exposed through a new composition-root method `Container.loadPrDiff(...)` that delegates to `modules/reviews/diff-loader.ts#loadDiff`. The eval module may not import `modules/reviews/**` (`no-cross-module-reach`), and the container already imports `modules/reviews/repository.js`, so this follows the existing pattern.
- **K6 — Regression banner is structured + string.** `EvalDashboard.alert` (existing contract, `string | null`) gets a plain English fallback (AC-36). The client renders the banner from a new structured `regression` field so the copy stays in `messages/en/eval.json`.

---

## Context

**What exists (consume, don't recreate):**
- Tables `eval_cases` / `eval_runs` in `server/src/db/schema/eval.ts:7-35`. They're lesson scaffolding, never written to, and get extended in place (Step 2).
- Contracts in both vendored copies: `EvalPerTrace`, `EvalRun`, `EvalOwnerKind`, `EvalCase` (`contracts/knowledge.ts:49-84`, section delimited by `// ---- Eval ----` … `// ---- Memory ----`). Also `EvalCaseInput`, `EvalRunRecord`, `EvalRunResult`, `EvalTrendPoint`, `EvalDashboard` (`contracts/eval-ci.ts:15-89`, section delimited by `// Eval — case input + persisted run record + dashboard` … `// Compose Review`). All are reused unchanged. New shapes go into a NEW file `contracts/eval-pipeline.ts` (both copies) plus one barrel line in each `index.ts`.
- i18n namespace `client/messages/en/eval.json` (`dashboard`, `caseEditor`, `evalsTab`, `page`): add keys and don't restructure. `client/messages/en/agents.json:50` already has `editor.tabs.evals = "Evals"`. `client/messages/en/shell.json:24` already has `nav.eval = "Eval Dashboard"`.
- `activeKeyFor` (`client/src/components/app-shell/helpers.ts:35`) already returns `"eval"` for `/eval*`, so it needs no change, only a test.
- `NAV` registry (`client/src/vendor/ui/nav.ts:30-43`) is per-lesson data, and the INSIGHTS precedent (client 2026-09-22) is to add a `NavItemDef` there.
- Engine: `reviewPullRequest` (`reviewer-core/src/review/run.ts:129`) returns `ReviewOutcome` with `review.findings` (survivors), `dropped`, `costUsd`, `grounding` (`run.ts:101-119`). Optional slots `callers`/`repoMap`/`specs`/`intentBrief` are omit-when-absent, so leaving them out satisfies AC-12.
- Run lifecycle precedent: `ReviewService.runReview` creates rows first and then calls `void executor.executeRuns(...)` (`reviews/service.ts:103-138`). Boot reaping happens in `app.ts:80-85`.
- Finding context: `container.reviewRepo.findingContext(findingId)` → `{ finding, review, pull }` (`reviews/repository.ts:124-128`). Decision timestamps are `findings.accepted_at` / `dismissed_at`.
- Agent data: `container.agentsRepo.getById`, `.linkedSkills(agentId)` (`agents/repository.ts:65,192`). `agents.version` is bumped on config change (`repository.ts:112-146`).
- Diff parsing: `parseUnifiedDiff(raw)` (`server/src/adapters/git/diff-parser.ts:14`).
- Mock LLM: `MockLLMProvider` with `structured` / `structuredBySchema` fixtures (`server/src/adapters/mocks.ts:44-105`) records `calls`.
- Seed: Security Reviewer (`seed.ts:203-212`, provider `openrouter`). The seeded review has **no `agentId`** (`seed.ts:146-158`), so the two seeded findings can't be turned into cases (409 `finding_no_agent`). That's expected, see Risks.

**What is missing:** the `eval` server module, the batch table/columns + migration, scoring, the seed cases, all client eval UI, the root `package.json`, and the verify script.

**Layering for the new server module `server/src/modules/eval/`:**
| File | Layer | Notes |
|---|---|---|
| `routes.ts` | presentation | Zod params/body/response, one service call per route |
| `service.ts` | application | `EvalService` — use cases; no `fastify`, no `drizzle-orm`, no `adapters/` import |
| `run-executor.ts` | application | `EvalRunExecutor` — background per-case execution |
| `frozen-diff.ts` | application helper (non-domain) | the ONLY eval file importing `../../adapters/git/diff-parser.js` (same pattern as `reviews/diff-loader.ts`; rule `no-service-imports-adapters-directly` matches only `service.ts`/`run-executor.ts`, and `no-domain-outward` only `helpers|constants|types.ts`) |
| `repository.ts` | persistence | `EvalRepository` — only file in the module importing `drizzle-orm` |
| `helpers.ts` | domain | pure: fragment extraction, expectation building/summaries, dashboard math, DTO mappers. Imports only `@devdigest/shared` types + `./constants.js` |
| `constants.ts` | domain | literals |

---

## Steps

### Step 1 — Add the new shared contract file to BOTH vendored copies  ·  [full-stack]
- **Files:** `server/src/vendor/shared/contracts/eval-pipeline.ts` (new) · `client/src/vendor/shared/contracts/eval-pipeline.ts` (new, **byte-identical content**) · `server/src/vendor/shared/index.ts` (edit: append `export * from './contracts/eval-pipeline.js';` after the `eval-ci.js` line, and add a line to the header comment) · `client/src/vendor/shared/index.ts` (same edit)
- **Layer:** n/a (contracts)
- **Interfaces** (imports only from `./findings.js` [`Finding`, `Severity`, `FindingCategory`], `./knowledge.js` [`EvalCase`, `EvalRun`], `./eval-ci.js` [`EvalCaseInput`, `EvalRunRecord`, `EvalTrendPoint`, `EvalDashboard`]. All of these exist in both copies. Do NOT import `Provider`/`CiFailOn`, which have drifted.):
  ```ts
  export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag']);
  export const EvalExpectationItem = z.object({
    kind: EvalExpectationKind,
    file: z.string().min(1),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive().optional(),   // defaults to start_line in scoring
    severity: Severity.optional(),                       // descriptive only, never matched
    category: FindingCategory.optional(),
    title: z.string().optional(),
  }).strict();                                            // typo'd keys (e.g. "line") → 422
  export const EvalExpectation = z.array(EvalExpectationItem);
  export const EvalCaseDecision = z.enum(['accepted', 'dismissed']);
  export const EvalCaseMeta = z.object({
    title: z.string().default(''),
    body: z.string().default(''),
    source_finding_id: z.string().optional(),
    source_pr_id: z.string().optional(),
    decision: EvalCaseDecision.optional(),
    origin: z.enum(['seed', 'finding', 'manual']).optional(),
  });
  /** Create/update body for /agents/:id/eval-cases and /eval-cases/:id (owner from the route). */
  export const EvalCaseBody = EvalCaseInput.omit({ owner_kind: true, owner_id: true, input_files: true }).extend({
    input_diff: z.string().min(1).max(200_000),
    input_meta: EvalCaseMeta.optional(),
    expected_output: EvalExpectation,
    name: z.string().min(1).max(120),
  });
  export type EvalCaseBodyInput = z.input<typeof EvalCaseBody>;
  export const EvalCaseScore = z.object({
    expected_find: z.number().int(), found: z.number().int(),
    kept: z.number().int(), noise: z.number().int(), dropped: z.number().int(),
    recall: z.number().nullable(), precision: z.number().nullable(), citation_accuracy: z.number().nullable(),
    pass: z.boolean(),
  });
  export const EvalCaseActualOutput = z.object({
    kept: z.array(Finding),
    dropped: z.array(z.object({ finding: Finding, reason: z.string() })),
    score: EvalCaseScore.nullable(),      // null when errored
    error: z.string().nullable(),         // AC-14
  });
  export const EvalCaseLastRunStatus = z.enum(['passed', 'failed', 'errored', 'never_run']);
  export const EvalCaseView = EvalCase.extend({
    agent_id: z.string().nullable(),
    source_finding_id: z.string().nullable(),
    created_at: z.string(),
    summary: z.object({ items: z.number().int(), must_find: z.number().int(), must_not_flag: z.number().int(),
                        chip: z.string().nullable() }),          // "CRITICAL·security" | null → UI "empty []"
    last_run: z.object({ status: EvalCaseLastRunStatus, ran_at: z.string().nullable(),
                         expected_count: z.number().int(), actual_count: z.number().int().nullable(),
                         recall: z.number().nullable(), precision: z.number().nullable(),
                         citation_accuracy: z.number().nullable(), duration_ms: z.number().int().nullable() }),
  });
  export const TurnIntoEvalCaseResponse = z.object({ case: EvalCaseView, created: z.boolean() });
  export const EvalRunStatus = z.enum(['running', 'done', 'failed']);
  export const StartEvalRunBody = z.object({ case_ids: z.array(z.string().uuid()).min(1).max(200).optional() });
  export const EvalRunConfig = z.object({ provider: z.string(), model: z.string(), system_prompt: z.string(),
                                          strategy: z.string(), skill_ids: z.array(z.string()) });
  export const EvalMetricNa = z.object({ recall: z.boolean(), precision: z.boolean(), citation_accuracy: z.boolean() });
  export const EvalRunSummary = z.object({
    id: z.string(), agent_id: z.string(), agent_name: z.string(), agent_version: z.number().int(),
    model: z.string(), status: EvalRunStatus, partial: z.boolean(),
    started_at: z.string(), finished_at: z.string().nullable(),
    case_ids: z.array(z.string()), case_count: z.number().int(), errored_count: z.number().int(),
    cost_usd: z.number().nullable(), error: z.string().nullable(),
    aggregate: EvalRun.nullable(),        // null while running / when failed before any case
    na: EvalMetricNa,                     // AC-22: true ⇒ run-level value is the vacuous 1, render "n/a"
  });
  export const StartEvalRunResponse = z.object({ run: EvalRunSummary });
  export const EvalRunDetail = EvalRunSummary.extend({ config: EvalRunConfig, cases: z.array(EvalRunRecord) });
  export const EvalRegression = z.object({
    metric: z.enum(['recall', 'precision', 'citation_accuracy']),
    drop: z.number(),                     // positive fraction, e.g. 0.04
    version: z.number().int(), previous_version: z.number().int(),
  });
  export const AgentEvalDashboard = z.object({
    dashboard: EvalDashboard,             // existing contract; recent_runs = latest full run's per-case records
    runs: z.array(EvalRunSummary),        // RECENT RUNS table (newest first, full + partial)
    regression: EvalRegression.nullable(),
  });
  export const EvalAgentCard = z.object({
    agent_id: z.string(), agent_name: z.string(), model: z.string(), cases_total: z.number().int(),
    last_run: EvalRunSummary.nullable(), trend: z.array(EvalTrendPoint),
  });
  export const EvalWorkspaceDashboard = z.object({ agents: z.array(EvalAgentCard), recent_runs: z.array(EvalRunSummary) });
  ```
  Export a `type X = z.infer<typeof X>` for each.
- **Skills to invoke:** `zod`, `typescript-expert`
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` and `cd client && pnpm typecheck` pass. The two `eval-pipeline.ts` files are identical after CRLF normalization. Write the server file first, then copy it verbatim (root INSIGHTS 2026-10-05: new files come out LF while siblings are CRLF; the verify script normalizes, but keep the two new files identical to each other). `knowledge.ts` and `eval-ci.ts` are untouched in both copies.

### Step 2 — Extend the eval schema (batches + additive columns)  ·  [backend]
- **Files:** `server/src/db/schema/eval.ts` (edit) · `server/src/db/schema.ts` (edit: import `evalBatches` and add it to the `schema` object next to `evalRuns`) · `server/src/db/rows.ts` (edit: add `EvalCaseRow`, `EvalRunRow`, `EvalBatchRow` types)
- **Layer:** persistence (schema)
- **Interfaces** (new imports in `eval.ts`: `agents` from `./agents`, `findings` from `./reviews`, `now` from `./_shared`, `index`, `uniqueIndex` from `drizzle-orm/pg-core`, `sql` from `drizzle-orm`):
  - `evalCases` adds: `agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' })` (nullable, set when `owner_kind='agent'`), `sourceFindingId: uuid('source_finding_id').references(() => findings.id, { onDelete: 'set null' })`, `createdAt: now()`. Table extras: `uniqueIndex('eval_cases_source_finding_uq').on(t.sourceFindingId)` (Postgres treats NULLs as distinct) and `index('eval_cases_agent_idx').on(t.agentId)`.
  - New `evalBatches = pgTable('eval_batches', {...})`: `id` uuid pk defaultRandom; `workspaceId` notNull FK workspaces cascade; `agentId` notNull FK agents cascade; `agentVersion: integer('agent_version').notNull()`; `configJson: jsonb('config_json').notNull()`; `status: text('status', { enum: ['running','done','failed'] }).notNull().default('running')`; `partial: boolean('partial').notNull().default(false)`; `caseIds: jsonb('case_ids').notNull()`; `startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull()`; `finishedAt: timestamp('finished_at', { withTimezone: true })`; `aggregate: jsonb('aggregate')`; `na: jsonb('na')`; `costUsd: doublePrecision('cost_usd')`; `erroredCount: integer('errored_count').notNull().default(0)`; `error: text('error')`. Extras: `index('eval_batches_agent_started_idx').on(t.agentId, t.startedAt)`, `uniqueIndex('eval_batches_one_running_per_agent').on(t.agentId).where(sql\`status = 'running'\`)`.
  - **Declaration order:** `evalBatches` must be declared **before** `evalRuns` in the file, because `evalRuns` references it.
  - `evalRuns` adds: `batchId: uuid('batch_id').references(() => evalBatches.id, { onDelete: 'cascade' })` (nullable) + `index('eval_runs_batch_idx').on(t.batchId)` and `index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt)`.
  - Leave `conformanceChecks` / `composedReviews` untouched.
- **Skills to invoke:** `postgresql-table-design`, `drizzle-orm-patterns`
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` passes and no existing column was renamed or dropped.

### Step 3 — Generate the migration  ·  [backend]
- **Files:** `server/src/db/migrations/0015_*.sql` (new, **generated**) · `server/src/db/migrations/meta/0015_snapshot.json` (new, generated) · `server/src/db/migrations/meta/_journal.json` (appended by the tool only)
- **Layer:** persistence
- **Interfaces:** run `cd server && pnpm db:generate`. Never hand-write or hand-edit SQL. If the generated SQL lacks the `WHERE status = 'running'` clause on the partial index (drizzle-kit version quirk), do NOT edit the file. Fall back to dropping `.where(...)` from the schema, regenerate, and enforce AC-18 in `EvalRepository.createBatch` with a `SELECT ... FOR UPDATE`-free check inside a transaction (see Step 6), then record it under Risks in the PR description.
- **Skills to invoke:** `postgresql-table-design`, `drizzle-orm-patterns`
- **Depends on:** Step 2
- **Done when:** exactly one new `.sql`, one new snapshot, and one appended journal entry exist. `git diff` shows no change to `0000`–`0014` files or to prior journal entries. Running `pnpm db:generate` again prints "No schema changes" and creates no file. `pnpm db:migrate` applies cleanly on a dev DB.

### Step 4 — Pure scoring in reviewer-core  ·  [backend]
- **Files:** `reviewer-core/src/eval/score.ts` (new) · `reviewer-core/src/index.ts` (edit: add an export block) · `reviewer-core/test/eval-score.test.ts` (new)
- **Layer:** domain (pure engine)
- **Interfaces** (types from `@devdigest/shared`, which resolves to the server copy per `reviewer-core/tsconfig.json:22`; no I/O, no `LLMProvider` import anywhere in the file):
  ```ts
  export function normalizeEvalPath(p: string): string;            // strip ONE leading "a/" | "b/" | "./"; case-sensitive
  export function rangesOverlap(a: [number, number], b: [number, number]): boolean; // normalizes min/max; inclusive
  export interface EvalScoreFinding { file: string; start_line: number; end_line: number }
  export interface ScoreEvalCaseInput { expected: EvalExpectationItem[]; kept: EvalScoreFinding[]; droppedCount: number }
  export function scoreEvalCase(input: ScoreEvalCaseInput): EvalCaseScore;
  export interface ScoredEvalCase {
    name: string; expected: EvalExpectationItem[]; actual: unknown;
    score: EvalCaseScore | null;   // null ⇒ errored (excluded from every denominator and from cost)
    costUsd: number | null;
  }
  export interface EvalAggregate { run: EvalRun; na: EvalMetricNa; erroredCount: number }
  export function aggregateEvalScores(cases: ScoredEvalCase[], wallMs: number): EvalAggregate;
  ```
  Algorithm exactly as spec §"Scoring algorithm":
  - `found` = count of `must_find` items hit by ≥1 kept finding.
  - `noise` = count of kept findings hitting ≥1 `must_not_flag` item.
  - recall = `found/|E_find|` (null if 0); precision = `(|K|-noise)/|K|` (null if `|K|`=0); citation = `|K|/(|K|+D)` (null if 0).
  - pass = `found===|E_find| && noise===0 && (E.length>0 || |K|===0)`.
  - Aggregate micro-averages over non-errored cases. `traces_total` = non-errored count. `cost_usd` = sum over non-errored cases, `null` if any is null. A zero run-level denominator → value `1` and the matching `na` flag `true`. `per_trace` = one `{ name, pass: score?.pass ?? false, expected, actual }` per case, errored included.
  - Index export block in `index.ts`: `export { normalizeEvalPath, rangesOverlap, scoreEvalCase, aggregateEvalScores, type ScoreEvalCaseInput, type ScoredEvalCase, type EvalAggregate, type EvalScoreFinding } from './eval/score.js';`
- **Tests** (`eval-score.test.ts`): `a/`, `b/`, `./` prefixes; touching ends (`[5,7]` vs `[7,9]` → overlap); adjacent (`[5,6]` vs `[7,9]` → no overlap); reversed ranges; missing `end_line`; recall/precision/citation per case; every zero-denominator path → `null`; empty expectation passes only with `|K|=0`; contradictory item (one finding hitting both kinds counts as found AND noise); two findings on one `must_find` (recall counts once, both in the precision denominator); aggregate micro-averaging; errored case exclusion; cost null propagation; run-level vacuous `1` + `na`; determinism (same input twice → deep-equal). **Zero-LLM proof:** build a counting stub `LLMProvider` (inline in the test, `calls` counter), run `reviewPullRequest` once with it, record N, then call `scoreEvalCase`/`aggregateEvalScores` on the outcome and assert the counter is still N. Add `expectTypeOf(scoreEvalCase).parameters` / `aggregateEvalScores` assertions that no parameter is assignable from `LLMProvider`.
- **Skills to invoke:** `typescript-expert`, `onion-architecture`
- **Depends on:** Step 1 (types)
- **Done when:** `cd reviewer-core && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && ./node_modules/.bin/vitest run` is green (reviewer-core INSIGHTS 2026-09-18: call the bins directly if `pnpm` fails on the symlink step). `src/eval/score.ts` imports nothing besides types from `@devdigest/shared`.

### Step 5 — Composition-root diff access + scripted mock option  ·  [backend]
- **Files:** `server/src/platform/container.ts` (edit) · `server/src/adapters/mocks.ts` (edit)
- **Layer:** infrastructure
- **Interfaces:**
  - `container.ts`: `import { loadDiff } from '../modules/reviews/diff-loader.js';` and add the method
    ```ts
    /** Load a PR's unified diff with the SAME loader reviews use (git diff, else pr_files patches). Exposed so the eval module can freeze a fragment without reaching into modules/reviews (no-cross-module-reach). */
    loadPrDiff(workspaceId: string, pull: PullRow, repo: typeof schema.repos.$inferSelect): Promise<UnifiedDiff> {
      return loadDiff(this, this.reviewRepo, workspaceId, pull, repo);
    }
    ```
    (`import type { PullRow } from '../db/rows.js'`, `import type * as schema from '../db/schema.js'`, `UnifiedDiff` type from `@devdigest/shared`.) `diff-loader.ts` imports `Container` as a type only, so there is no runtime cycle. Run `pnpm arch` to confirm `no-circular` stays green.
  - `mocks.ts`: add `structuredFn?: (req: StructuredRequest<unknown>) => unknown;` to `MockLLMOptions`. In `completeStructured`, compute the fixture as `this.opts.structuredFn?.(req as StructuredRequest<unknown>) ?? this.opts.structuredBySchema?.[req.schemaName] ?? this.opts.structured ?? {}`. Existing behaviour is unchanged when the option is absent.
- **Skills to invoke:** `onion-architecture`, `security`, `typescript-expert`
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck && pnpm arch` pass with no new violations, and the existing `reviews.it.test.ts` still passes.

### Step 6 — `EvalRepository` (persistence)  ·  [backend]
- **Files:** `server/src/modules/eval/repository.ts` (new)
- **Layer:** persistence
- **Interfaces** — `export class EvalRepository { constructor(private db: Db) {} ... }`, all workspace-scoped:
  - `listCasesForAgent(workspaceId, agentId): Promise<{ row: EvalCaseRow; last: EvalRunRow | null }[]>`: cases `where owner_kind='agent' and owner_id=agentId and workspace_id=ws` ordered by `created_at asc, name asc`, plus each case's latest `eval_runs` row (`DISTINCT ON (case_id) ... ORDER BY case_id, ran_at DESC`, or a lateral/subquery, implementer's choice).
  - `countCasesForAgent(workspaceId, agentId): Promise<number>`
  - `getCase(workspaceId, caseId)`, `getCaseBySourceFinding(workspaceId, findingId)`, `getCasesByIds(workspaceId, agentId, ids: string[])`
  - `findCaseByOwnerAndName(workspaceId, agentId, name)`
  - `insertCase(values: { workspaceId; agentId; name; inputDiff; inputMeta; expectedOutput; notes?; sourceFindingId? }): Promise<EvalCaseRow | null>` sets `ownerKind:'agent'`, `ownerId: agentId`, `agentId`. Returns `null` on unique violation of `eval_cases_source_finding_uq` (pg code `23505`) so the service can re-read the winner (AC-5 race).
  - `updateCase(workspaceId, caseId, patch)`, `deleteCase(workspaceId, caseId): Promise<boolean>` (`eval_runs` cascade via the existing FK)
  - `createBatch(values: { workspaceId; agentId; agentVersion; configJson; partial; caseIds }): Promise<EvalBatchRow | null>` returns `null` on `23505` from `eval_batches_one_running_per_agent` (→ 409)
  - `insertCaseRun(values: { caseId; batchId; actualOutput; pass; recall; precision; citationAccuracy; durationMs; costUsd }): Promise<EvalRunRow>`
  - `completeBatch(batchId, values: { status: 'done' | 'failed'; aggregate: unknown | null; na: unknown | null; costUsd: number | null; erroredCount: number; error: string | null })` sets `finished_at = now()`
  - `listBatchesForAgent(workspaceId, agentId, limit): Promise<EvalBatchRow[]>`, newest `started_at` first
  - `listRecentBatches(workspaceId, limit): Promise<{ batch: EvalBatchRow; agentName: string; model: string }[]>` (inner join `agents`)
  - `getBatch(workspaceId, batchId)`, `caseRunsForBatch(batchId): Promise<{ run: EvalRunRow; caseName: string }[]>` (join `eval_cases` for `case_name`)
  - `agentsWithCases(workspaceId): Promise<{ agentId; agentName; model; casesTotal: number }[]>` (inner join `agents` on `eval_cases.agent_id`, group by agent)
  - `reapStaleBatches(): Promise<number>` → `update eval_batches set status='failed', error='Interrupted by server restart', finished_at=now() where status='running'` (R6 analogue; keeps partial case rows)
- **Skills to invoke:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`
- **Depends on:** Step 3
- **Done when:** typecheck + `pnpm arch` pass. This is the only eval file importing `drizzle-orm`.

### Step 7 — Domain helpers, constants, frozen-diff parser  ·  [backend]
- **Files:** `server/src/modules/eval/constants.ts` (new) · `server/src/modules/eval/helpers.ts` (new) · `server/src/modules/eval/frozen-diff.ts` (new) · `server/test/eval-helpers.test.ts` (new, hermetic)
- **Layer:** domain (`helpers.ts`, `constants.ts`) · application helper (`frozen-diff.ts`)
- **Interfaces:**
  - `constants.ts`: `REGRESSION_THRESHOLD = 0.02`, `TREND_LIMIT = 20`, `RUN_HISTORY_LIMIT = 50`, `RECENT_RUNS_LIMIT = 20`, `CASE_NAME_MAX = 60`, `EVAL_RUN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const`, `STALE_RUN_ERROR = 'Interrupted by server restart'`, error codes `ERR_FINDING_UNDECIDED = 'finding_undecided'`, `ERR_FINDING_NO_AGENT = 'finding_no_agent'`, `ERR_DIFF_UNAVAILABLE = 'diff_unavailable'`, `ERR_RUN_IN_PROGRESS = 'eval_run_in_progress'`, `ERR_NO_CASES = 'eval_no_cases'`, `ERR_INVALID_CASE = 'eval_invalid_case'`.
  - `helpers.ts` (pure, no Container/db/adapters/fastify):
    - `extractFileFragment(raw: string, file: string): string | null` splits on `/^diff --git /m` and returns the whole block (header + all hunks) whose `+++ b/<path>` or `diff --git a/<p> b/<p>` matches `file` (normalize with `normalizeEvalPath` from reviewer-core). Returns null if not found. Context hunks come with the block, which caps the fragment to the finding's file (spec edge "Large diffs").
    - `decisionOf(f: { acceptedAt: Date | null; dismissedAt: Date | null }): 'accepted' | 'dismissed' | null`. If both are set, the later timestamp wins.
    - `expectationFromFinding(f: FindingRow, decision): EvalExpectationItem` → `{ kind: decision==='accepted' ? 'must_find' : 'must_not_flag', file, start_line, end_line, severity, category, title }`
    - `caseNameFromFinding(title: string, findingId: string): string` → kebab slug of the title, truncated to `CASE_NAME_MAX - 7`, plus `-` and the first 6 chars of the id
    - `summarizeExpectation(items): EvalCaseView['summary']`. `chip` = `"<SEVERITY>·<category>"` of the first item that has both, else null.
    - `lastRunView(expected, last: EvalRunRow | null): EvalCaseView['last_run']`. Errored = `last.pass === null`. `actual_count` = `actual_output.kept.length`.
    - `caseRowToView(row, last): EvalCaseView`, `batchToSummary(batch, agentName, model): EvalRunSummary`, `caseRunToRecord(run, caseName): EvalRunRecord`
    - `validateCaseAgainstDiff(items: EvalExpectationItem[], diffFilePaths: string[]): string[]` returns issue strings, one per item whose normalized file is absent from the diff
    - `buildAgentDashboard(agentId, casesTotal, batches: EvalBatchRow[], latestFullCaseRecords: EvalRunRecord[]): { dashboard: EvalDashboard; regression: EvalRegression | null }`. Full runs = `partial=false && status='done' && aggregate != null`, chronological for `trend` (≤ `TREND_LIMIT`). `current` = latest full aggregate (zeros + `traces_total:0` if none). `delta` = latest − previous full (0 if <2). `regression` = the metric with the largest drop ≥ `REGRESSION_THRESHOLD` (ties: recall > precision > citation). `alert` = `null` or `"<Metric> dropped <pp> pts in v<N> vs v<M>"`. `pass_rate` = `traces_passed/traces_total` (1 if 0).
  - `frozen-diff.ts`: `import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';` and `export function parseFrozenDiff(text: string): UnifiedDiff` throws `ValidationError(ERR_INVALID_CASE…)` (from `platform/errors.js`) when the parse yields 0 files or 0 hunks.
- **Tests** (`eval-helpers.test.ts`, hermetic): fragment extraction (multi-file raw, `a/`/`b/` paths, missing file → null); decision precedence; name slug; summary chip incl. empty; dashboard delta/trend/alert at exactly 0.02 (fires), 0.019 (doesn't), partial runs excluded, single run → delta 0, no runs.
- **Skills to invoke:** `onion-architecture`, `typescript-expert`
- **Depends on:** Steps 1, 4, 6 (row types)
- **Done when:** `cd server && pnpm exec vitest run test/eval-helpers.test.ts` green and `pnpm arch` clean (`no-domain-outward` holds for `helpers.ts`/`constants.ts`).

### Step 8 — `EvalService` + `EvalRunExecutor` (application)  ·  [backend]
- **Files:** `server/src/modules/eval/service.ts` (new) · `server/src/modules/eval/run-executor.ts` (new)
- **Layer:** application
- **Interfaces:**
  - `export class EvalService { constructor(private container: Container) { this.repo = new EvalRepository(container.db); this.executor = new EvalRunExecutor(container, this.repo); } }`
    - `listCases(ws, agentId): Promise<EvalCaseView[]>` 404s if `container.agentsRepo.getById` misses.
    - `createCase(ws, agentId, body: EvalCaseBody): Promise<EvalCaseView>`: parse `body.input_diff` via `parseFrozenDiff`; `validateCaseAgainstDiff` non-empty → `throw new ValidationError('Expected output references files not in the diff', issues)` (422); `input_meta` defaults to `{ title:'', body:'', origin:'manual' }`.
    - `getCase`, `updateCase(ws, caseId, body)` (same validation), `deleteCase(ws, caseId)` (404 when missing).
    - `turnFindingIntoCase(ws, findingId): Promise<{ case: EvalCaseView; created: boolean }>`:
      1. `ctx = container.reviewRepo.findingContext(findingId)`. Missing or `ctx.pull.workspaceId !== ws` → `NotFoundError('Finding not found')`.
      2. `decision = decisionOf(ctx.finding)`. Null → `new AppError(ERR_FINDING_UNDECIDED, 'Finding must be accepted or dismissed before it can become an eval case', 409)`.
      3. `ctx.review.agentId` null, or `agentsRepo.getById` misses → `AppError(ERR_FINDING_NO_AGENT, 'Finding has no producing agent (its review was not run by an agent)', 409)`.
      4. `existing = repo.getCaseBySourceFinding(ws, findingId)` → return `{ case, created:false }`.
      5. `repoRow = container.reviewRepo.getRepo(ctx.pull.repoId)`, then `diff = await container.loadPrDiff(ws, ctx.pull, repoRow)`. Any throw, or `extractFileFragment(diff.raw, finding.file) === null` → `AppError(ERR_DIFF_UNAVAILABLE, 'Could not load the diff fragment for <file> (clone missing and no stored patch)', 409)`. Nothing is persisted.
      6. `insertCase({ name: caseNameFromFinding(...), inputDiff: fragment, inputMeta: { title: pull.title, body: pull.body ?? '', source_finding_id, source_pr_id: pull.id, decision, origin: 'finding' }, expectedOutput: [expectationFromFinding(...)], sourceFindingId })`. `null` (lost race) → re-read via `getCaseBySourceFinding` and return `created:false`.
    - `startRun(ws, agentId, body: StartEvalRunBody, logger?): Promise<EvalRunSummary>`:
      1. agent 404.
      2. Cases: `body.case_ids` → `getCasesByIds` (any id not owned → `ValidationError` 422), else all cases. Zero → `AppError(ERR_NO_CASES, 'Agent has no eval cases', 422)`, no batch row (AC-16).
      3. `skills = (await container.agentsRepo.linkedSkills(agent.id)).filter(l => l.skill.enabled)`.
      4. `config = { provider: agent.provider, model: agent.model, system_prompt: agent.systemPrompt, strategy: agent.strategy, skill_ids: skills.map(l => l.skill.id) }`.
      5. `batch = repo.createBatch({ ..., agentVersion: agent.version, partial: !!body.case_ids, caseIds })`. `null` → `AppError(ERR_RUN_IN_PROGRESS, 'An eval run is already in progress for this agent', 409)`.
      6. `void this.executor.execute(ws, batch, agent, cases, skills.map(l => l.skill.body), logger).catch(err => logger?.error(...))`.
      7. Return the summary immediately, before any LLM call (AC-10).
    - `listRuns(ws, agentId)`, `getRun(ws, runId): Promise<EvalRunDetail>` (404), `agentDashboard(ws, agentId): Promise<AgentEvalDashboard>`, `workspaceDashboard(ws): Promise<EvalWorkspaceDashboard>` (cards only for agents with ≥1 case; `last_run` = latest full done batch, else latest any; `recent_runs` = `listRecentBatches(ws, RECENT_RUNS_LIMIT)`), `reapStaleRuns(): Promise<number>`.
  - `export class EvalRunExecutor { constructor(private container: Container, private repo: EvalRepository) {} async execute(ws, batch: EvalBatchRow, agent: AgentRow, cases: EvalCaseRow[], skillBodies: string[], logger?: Logger): Promise<void> }`. Define a local `Logger` type with the same shape as `reviews/run-executor.ts:21-26`; do not import from reviews.
    1. `const wallStart = Date.now()`.
    2. `llm = await container.llm(agent.provider as Provider)`. On throw, `completeBatch({ status:'failed', error: err.message, aggregate:null, na:null, costUsd:null, erroredCount:0 })` and return (AC-15/K3: same message the review run shows, e.g. `OPENROUTER_API_KEY is not configured`; no secret value is ever included).
    3. For each case, **sequentially**, in try/catch:
       - `diff = parseFrozenDiff(c.inputDiff)`; `meta = EvalCaseMeta.parse(c.inputMeta ?? {})`; `expected = EvalExpectation.parse(c.expectedOutput ?? [])`.
       - `outcome = await reviewPullRequest({ systemPrompt: cfg.system_prompt, model: cfg.model, diff, llm, strategy: cfg.strategy, ...(skillBodies.length ? { skills: skillBodies } : {}), ...(meta.body ? { prDescription: meta.body } : {}), task: meta.title ? \`Review this change: "${meta.title}"\` : 'Review this change.', sessionId: \`eval:${batch.id}:${c.id}\` })`. **No** `callers`, `repoMap`, `specs`, or `intentBrief` (AC-12/D7), and the case name never enters the prompt.
       - `score = scoreEvalCase({ expected, kept: outcome.review.findings, droppedCount: outcome.dropped.length })`.
       - `insertCaseRun({ actualOutput: { kept: outcome.review.findings, dropped: outcome.dropped, score, error: null }, pass: score.pass, recall/precision/citationAccuracy: score.*, durationMs, costUsd: outcome.costUsd })`.
       - On catch: `insertCaseRun({ actualOutput: { kept: [], dropped: [], score: null, error: (err as Error).message }, pass: null, metrics null, durationMs, costUsd: null })` and continue (AC-14).
       - Collect `ScoredEvalCase` entries.
    4. `agg = aggregateEvalScores(scored, Date.now() - wallStart)`.
    5. Status: `'failed'` with `error: 'All N case(s) errored'` if every case errored, else `'done'`. Call `completeBatch({ aggregate: agg.run, na: agg.na, costUsd: agg.run.cost_usd, erroredCount: agg.erroredCount })`.
    6. Wrap the whole body so that an unexpected throw still calls `completeBatch({status:'failed', error})`. A batch never stays `running`.
- **Skills to invoke:** `onion-architecture`, `typescript-expert`
- **Depends on:** Steps 4, 5, 6, 7
- **Done when:** typecheck + `pnpm arch` pass: no `fastify`, `drizzle-orm`, or `adapters/` import in `service.ts`/`run-executor.ts`, and no import from `../reviews/` or `../agents/`.

### Step 9 — Routes + module registration + boot reaping  ·  [backend]
- **Files:** `server/src/modules/eval/routes.ts` (new) · `server/src/modules/index.ts` (edit: `import evalModule from './eval/routes.js';` and entry `eval: evalModule`) · `server/src/app.ts` (edit: after the existing reaping `try` block, a second identical non-fatal `try { const reaped = await new EvalService(container).reapStaleRuns(); if (reaped > 0) app.log.info({ reaped }, 'reaped stale running eval batches on boot'); } catch (err) { app.log.warn(..., 'stale eval-run reaping failed (non-fatal)'); }`)
- **Layer:** presentation
- **Interfaces** (`app.withTypeProvider<ZodTypeProvider>()`, `getContext(container, req)` first in every handler, `IdParams` from `../_shared/schemas.js`, bodies via `schema.body` so 422 happens before the handler, `response: { 200|201|202: <Schema> }` declared for every route so serialization strips anything unexpected, AC-39):
  | Method + path | Body | Response | Notes |
  |---|---|---|---|
  | `POST /agents/:id/eval-runs` | `StartEvalRunBody` (empty body allowed → `{}`; use `body: StartEvalRunBody.default({})`-style tolerant schema or `req.body ?? {}` parse like `reviews/routes.ts:32`) | `202 StartEvalRunResponse` | `config.rateLimit: EVAL_RUN_RATE_LIMIT` |
  | `GET /agents/:id/eval-runs` | — | `EvalRunSummary[]` | newest first, ≤ `RUN_HISTORY_LIMIT` |
  | `GET /eval-runs/:id` | — | `EvalRunDetail` | 404 |
  | `GET /agents/:id/eval-cases` | — | `EvalCaseView[]` | |
  | `POST /agents/:id/eval-cases` | `EvalCaseBody` | `201 EvalCaseView` | |
  | `GET /eval-cases/:id` | — | `EvalCaseView` | |
  | `PUT /eval-cases/:id` | `EvalCaseBody` | `EvalCaseView` | |
  | `DELETE /eval-cases/:id` | — | `{ ok: true }` | |
  | `POST /findings/:id/eval-case` | none | `201` when created, `200` when existing — `TurnIntoEvalCaseResponse` | `reply.status(created ? 201 : 200)` |
  | `GET /agents/:id/eval-dashboard` | — | `AgentEvalDashboard` | |
  | `GET /eval-dashboard` | — | `EvalWorkspaceDashboard` | |
  Header comment lists the routes in the same style as `reviews/routes.ts:10-17`.
- **Skills to invoke:** `fastify-best-practices`, `security`, `onion-architecture`, `zod`
- **Depends on:** Step 8
- **Done when:** `pnpm typecheck && pnpm arch` pass. `pnpm dev` boots with zero keys (K3), and `curl -s localhost:3001/eval-dashboard` returns `{"agents":[...],"recent_runs":[]}` after seeding (Step 10).

### Step 10 — Seed >= 8 Security Reviewer cases  ·  [backend]
- **Files:** `server/src/db/seed-evals.ts` (new, pure data: no drizzle import, so unit tests stay hermetic) · `server/src/db/seed.ts` (edit: new block after the skills block, before `return`) · `server/test/eval-seed-shape.test.ts` (new, hermetic)
- **Layer:** persistence (seed)
- **Interfaces:**
  - `seed-evals.ts`: `export interface SeedEvalCase { name: string; input_diff: string; input_meta: { title: string; body: string; origin: 'seed' }; expected_output: EvalExpectationItem[]; notes: string }` and `export const SECURITY_REVIEWER_EVAL_CASES: readonly SeedEvalCase[]`, 9 cases, each a small synthetic unified diff with `diff --git a/X b/X` / `--- a/X` / `+++ b/X` / `@@` headers. Every expectation range must sit on **added** new-side lines of its own hunk:
    1. `stripe-key-leak`: `src/config.ts`, added line **12** `stripeKey: "sk_live_EXAMPLE_NOT_A_REAL_KEY_000",` → `must_find` 12, CRITICAL·security (matches the seeded finding at `src/config.ts:12`).
    2. `ssrf-webhook`: `src/api/public/webhooks.ts`, fetches `req.body.callbackUrl` unvalidated → `must_find`, CRITICAL·security.
    3. `service-role-in-client`: `web/src/lib/supabase.ts` builds a browser client with `process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` → `must_find`, CRITICAL·security.
    4. `sql-injection-raw-query`: `src/db/users.ts` interpolates `req.query.email` into a raw SQL string → `must_find`, CRITICAL·security.
    5. `env-secret-read`: `src/config.ts` reads `process.env.STRIPE_SECRET_KEY` (correct pattern) → `must_not_flag` on that line.
    6. `parameterized-query`: `src/db/orders.ts` tagged-template parameterized query → `must_not_flag`.
    7. `missing-retry-after`: `src/middleware/ratelimit.ts` returns 429 without `Retry-After` (not a security issue) → `must_not_flag`.
    8. `test-fixture-dummy-token`: `test/fixtures/auth.ts` `const DUMMY = 'not-a-secret'` → `must_not_flag`.
    9. `clean-refactor-no-flags`: `src/utils/format.ts` pure rename → `expected_output: []`.
    No realistic-looking key material (spec "Seeding story", D9).
  - `seed.ts` block: look up the Security Reviewer by `(workspaceId, name='Security Reviewer')`. For each case, `select` from `t.evalCases` where `ownerKind='agent' and ownerId=agent.id and name=c.name`. If absent, `insert { workspaceId, ownerKind:'agent', ownerId: agent.id, agentId: agent.id, name, inputDiff, inputMeta, expectedOutput, notes }`. Idempotent by owner + name (D6). Update the file's header comment (remove "eval" from the "start empty" sentence).
- **Tests** (`eval-seed-shape.test.ts`): `length >= 8`; ≥3 `must_find`, ≥3 `must_not_flag`, ≥1 empty; unique names; each `expected_output` passes `EvalExpectation.parse`; each diff parses through `parseUnifiedDiff` with ≥1 file; for each item, a synthetic finding at the item range survives `groundFindings` (from `@devdigest/reviewer-core`) against that diff, which proves every expectation is satisfiable; no string matches `/sk_live_[A-Za-z0-9]{20,}/` unless it contains `EXAMPLE`.
- **Skills to invoke:** `drizzle-orm-patterns`, `typescript-expert`, `security`
- **Depends on:** Steps 1, 3
- **Done when:** `cd server && pnpm db:migrate && pnpm db:seed` twice in a row leaves exactly 9 `eval_cases` rows for Security Reviewer, and the shape test is green.

### Step 11 — Server tests (contracts, routes, integration)  ·  [backend]
- **Files:** `server/test/contracts.test.ts` (edit: add an `it('eval pipeline contracts', ...)` next to the existing `EvalRun` assertion at line ~195, importing the new schemas from `@devdigest/shared`) · `server/test/eval-routes.test.ts` (new, hermetic) · `server/test/eval.it.test.ts` (new, Docker)
- **Layer:** n/a (tests)
- **Interfaces / cases:**
  - `contracts.test.ts`: `EvalExpectationItem` accepts mockup-6 shape, rejects unknown key (`line`), rejects `start_line: 0`. `EvalCaseBody` rejects empty `input_diff`. `EvalRunSummary`/`AgentEvalDashboard`/`EvalWorkspaceDashboard` parse a fixture.
  - `eval-routes.test.ts` (pattern of `blast-routes.test.ts`: `buildApp({ config, overrides: { auth: new MockAuthProvider(...) , secrets: new MockSecretsProvider({}) } })`, no DB; stub with `vi.spyOn(app.container.reviewRepo, 'findingContext')`, `vi.spyOn(app.container.agentsRepo, 'getById')`, `vi.spyOn(EvalRepository.prototype, '<method>')`):
    - invalid uuid param → 422
    - `POST /agents/:id/eval-cases` with `expected_output: [{ kind:'must_find', line: 3 }]` → 422 and the insert spy is never called
    - `POST /findings/:id/eval-case` on an undecided finding → 409 `finding_undecided`
    - `POST /findings/:id/eval-case` on a review with `agentId: null` → 409 `finding_no_agent`
    - `POST /agents/:id/eval-runs` with `countCasesForAgent`→0 / `listCasesForAgent`→[] → 422 `eval_no_cases`, and `createBatch` is never called
    - `createBatch`→`null` → 409 `eval_run_in_progress`
  - `eval.it.test.ts` (copy the `appWith` shape from `reviews.it.test.ts:122-150`: `secrets: new MockSecretsProvider({})`, `embedder`, `git: new MockGitClient({ diff })`, `llm: { openrouter: new MockLLMProvider('openai', { structuredFn }) }`, because the Security Reviewer is `openrouter`). Add a local `waitForEvalRun(app, runId)` poller on `GET /eval-runs/:id` until `status !== 'running'` (timeout 10s):
    1. **Case from accepted finding:** insert repo + PR + `pr_files` patch (like `setupRepoAndPr`) + a `reviews` row with `agentId = securityReviewer.id` + a finding on the patched line. Accept it via `POST /findings/:id/accept`, then `POST /findings/:id/eval-case` → 201, `expected_output[0].kind === 'must_find'`, `input_diff` contains `+++ b/src/config.ts`, `input_meta.decision === 'accepted'`, `source_finding_id` set. Repeat the call → 200, `created:false`, same id (AC-5).
    2. **Case from dismissed finding** → `must_not_flag` (AC-2).
    3. **Undecided** → 409.
    4. **Run all:** `POST /agents/<sec>/eval-runs` → 202 with `status:'running'` and `agent_version === agent.version`. A second immediate POST → 409. After `waitForEvalRun`: `status:'done'`, `cases.length === case count`, `aggregate.per_trace.length === case count`, `GET /agents/<sec>/eval-runs` lists it first.
    5. **Scripted experiment (good → changed → broken → no-secrets):** `structuredFn(req)` reads `req.messages`. It finds the matching `SECURITY_REVIEWER_EVAL_CASES` entry by checking that every `+` line of the case diff appears in the user message, and returns a `Review` whose findings depend on a marker in the system message: no marker → one finding per `must_find` item (exact range); `EVAL_MODE=changed` → good set minus the `ssrf-webhook` finding; `EVAL_MODE=broken` → findings on every expectation item of both kinds; `EVAL_MODE=nosecrets` → no findings. Switch modes via `PUT /agents/<sec> { system_prompt: base + '\nEVAL_MODE=…' }` and assert the version increments. Assert: baseline recall 1 / precision 1 / 9 of 9 passed; changed recall < baseline; broken **precision < baseline**; nosecrets **recall < baseline**; each run's `agent_version` differs and `config.system_prompt` contains the marker; `GET /agents/<sec>/eval-dashboard` after the broken run has a non-null `regression` with `metric:'precision'` and a non-null `dashboard.alert`.
    6. **Partial run:** `case_ids:[one]` → `partial:true`, excluded from `dashboard.trend`.
    7. **Errored case:** `structuredFn` throws for one case → that case has `pass:null` and `actual_output.error` set, the batch is `done` with `errored_count:1`, and `traces_total === n-1`.
    8. **Missing key:** an app with no `llm.openrouter` override and keyless secrets → batch ends `failed` with `error` matching `/OPENROUTER_API_KEY is not configured/`, and the response JSON contains no secret value.
    9. **Seed idempotent:** `await seed(db)` again leaves the case count for the agent unchanged, and it is ≥ 8.
    10. **Workspace dashboard** lists the Security Reviewer card with `cases_total >= 8`, and `recent_runs` is newest first.
    11. **Zero LLM during scoring:** the `MockLLMProvider.calls` length after a run equals the number of non-errored cases (one structured call per single-file case). Scoring adds none.
- **Skills to invoke:** `typescript-expert`, `security`
- **Depends on:** Steps 5–10
- **Done when:** `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` and `pnpm exec vitest run .it.test` (Docker up) are both green.

### Step 12 — Client data hooks + toast link  ·  [frontend]
- **Files:** `client/src/lib/hooks/eval.ts` (new) · `client/src/lib/hooks/index.ts` (edit: `export * from "./eval";`) · `client/src/lib/toast.tsx` (edit)
- **Layer:** n/a (frontend data)
- **Interfaces** (types only from `@devdigest/shared`, never a schema value; client INSIGHTS 2026-09-22):
  - `useAgentEvalCases(agentId)` → key `["eval-cases", agentId]`, `GET /agents/:id/eval-cases`
  - `useEvalCase(caseId)`, `useCreateEvalCase(agentId)`, `useUpdateEvalCase(agentId)`, `useDeleteEvalCase(agentId)`. These invalidate `["eval-cases", agentId]`, `["eval-dashboard", agentId]`, `["eval-dashboard"]`.
  - `useAgentEvalRuns(agentId)` → key `["eval-runs", agentId]`, `refetchInterval: (q) => (q.state.data ?? []).some(r => r.status === "running") ? 3000 : false`. This is the server-sourced running state (AC-35).
  - `useStartEvalRun(agentId)`: `POST /agents/:id/eval-runs` with `{ case_ids? }`. On settle it invalidates `["eval-runs", agentId]`. On error it raises `notify.error(err.message)`.
  - `useEvalRun(runId)` → `["eval-run", runId]`.
  - `useAgentEvalDashboard(agentId)` → `["eval-dashboard", agentId]` (also `refetchInterval` 3000 while any `runs[].status==='running'`).
  - `useEvalWorkspaceDashboard()` → `["eval-dashboard"]`.
  - `useTurnIntoEvalCase()`: `POST /findings/:id/eval-case` (no body; `apiFetch` already omits content-type, client INSIGHTS 2026-09-16). It returns `TurnIntoEvalCaseResponse`. The success toast is raised by the calling component's hook, not here.
  - When any eval run transitions running → done, invalidate `["eval-cases", agentId]` and `["eval-dashboard", agentId]` (in `useAgentEvalRuns`, compare the previous running set in an effect, or simply invalidate on each poll that sees no running runs after one did).
  - `toast.tsx`: extend `Toast` with `action?: { label: string; href: string }`. Change `push(message, kind, action?)`, `ToastApi.success(m, action?)` and `notify.success(m, action?)`. When `action` is present, render `<a href={action.href}>{action.label}</a>` inside the toast. Existing call signatures stay valid.
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `security`
- **Depends on:** Step 1
- **Done when:** `cd client && pnpm typecheck` passes.

### Step 13 — "Turn into eval case" on FindingCard  ·  [frontend]
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` (edit) · `.../FindingCard/FindingCard.test.tsx` (edit) · `.../FindingsPanel/FindingsPanel.tsx` (edit) · `.../DiffTab/useDiffFindings.tsx` (edit) · `client/src/app/repos/[repoId]/pulls/[number]/_hooks/useTurnIntoEvalCase.ts` (new) · `client/messages/en/eval.json` (edit: add `turnIntoCase: { action: "Turn into eval case", disabledHint: "Accept or dismiss this finding first: the decision decides whether the agent must find it or must not flag it.", created: "Eval case created", existing: "Eval case already exists", openEvals: "Open Evals tab" }`)
- **Layer:** n/a
- **Interfaces:**
  - `FindingCard` new optional props `onTurnIntoEval?: () => void; evalPending?: boolean`. Render only when `onTurnIntoEval` is passed, inside `s.actions` **after Dismiss** (Learn / Reply don't exist, see Risks): `<span title={undecided ? tEval("turnIntoCase.disabledHint") : undefined}><Button kind="ghost" size="sm" icon="FlaskConical" disabled={pending || evalPending || undecided} aria-describedby=… onClick={onTurnIntoEval}>{tEval("turnIntoCase.action")}</Button></span>`, where `undecided = !accepted && !dismissed` and `tEval = useTranslations("eval")`. The wrapper span carries the tooltip because disabled buttons don't fire hover in every browser.
  - `useTurnIntoEvalCase()` (route hook): wraps `useTurnIntoEvalCase` from `lib/hooks/eval`. On success it calls `toast.success(t(created ? "turnIntoCase.created" : "turnIntoCase.existing"), { label: t("turnIntoCase.openEvals"), href: \`/agents/${res.case.owner_id}?tab=evals\` })`. On `ApiError` it raises `toast.error(err.message)` (the 409 message names the failed precondition). It returns `{ turn(findingId), pendingId }`.
  - `FindingsPanel` and `useDiffFindings` pass `onTurnIntoEval={() => turn(f.id)}` and `evalPending={pendingId === f.id}`.
- **Tests** (`FindingCard.test.tsx`): provide `{ prReview, eval }` messages. Undecided → button disabled and the hint present in `title`. Accepted → enabled, and click calls `onTurnIntoEval`. Dismissed → enabled. Absent prop → no button. Existing assertions keep passing.
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`
- **Depends on:** Step 12
- **Done when:** `cd client && pnpm test -- FindingCard` is green.

### Step 14 — Shared eval metric components  ·  [frontend]
- **Files:** `client/src/components/eval-metrics/{EvalMetricTiles.tsx, helpers.ts, index.ts, helpers.test.ts}` (new)
- **Layer:** n/a
- **Interfaces:**
  - `helpers.ts`: `formatRate(v: number | null, na?: boolean): string` (`"n/a"` when null or na, else `"87%"`); `deltaPp(curr: number, prev: number): number` (×100, 1 decimal); `formatSignedPp(d: number): string` (`"+2.0 pts"` / `"−4.0 pts"`); `formatCostDelta(a: number | null, b: number | null): string` (`"—"` if either is null, else signed `$0.0123`).
  - `EvalMetricTiles({ current, delta, na, trend, tracesPassed, tracesTotal, showTraces })` renders `MetricCard` from `@devdigest/ui` for recall / precision / citation (`delta` in pp, `trend` arrays from `EvalTrendPoint`), plus a 4th "traces passed N/M" tile when `showTraces`. Labels come from `eval.dashboard.metrics.*`, plus a new key `eval.dashboard.metrics.tracesPassed: "TRACES PASSED"`.
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`
- **Depends on:** Step 12
- **Done when:** helper tests are green.

### Step 15 — AgentEditor "Evals" tab + case editor modal  ·  [frontend]
- **Files:**
  - `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (edit: add `{ key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" }` after `context`; update the comment)
  - `client/src/app/agents/[id]/_hooks/useAgentTab.ts` (edit: `VALID_TABS = ["config", "skills", "context", "evals"]`; client INSIGHTS 2026-09-22 says BOTH places must change)
  - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (edit: `tab === "evals" ? <EvalsTab agentId={agent.id} />`; update the header comment)
  - `.../AgentEditor/_components/EvalsTab/{EvalsTab.tsx, index.ts, styles.ts, useAgentEvalsTab.ts, helpers.ts, EvalsTab.test.tsx}` (new)
  - `.../EvalsTab/_components/EvalCaseRow/{EvalCaseRow.tsx, index.ts, styles.ts}` (new)
  - `.../EvalsTab/_components/EvalCaseEditorModal/{EvalCaseEditorModal.tsx, index.ts, styles.ts, helpers.ts, useEvalCaseEditor.ts, EvalCaseEditorModal.test.tsx}` (new)
  - `.../AgentEditor/AgentEditor.test.tsx` (edit: mock `./_components/EvalsTab`; assert `tab="evals"` renders it)
  - `client/messages/en/eval.json` (edit: add `evalsTab.viewDashboard: "View full dashboard"`, `evalsTab.runAll: "Run all evals ({count})"`, `evalsTab.passingSummary: "{passed}/{total} passing"`, `evalsTab.expectedGot: "expected {expected, plural, one {# finding} other {# findings}}, got {actual}"`, `evalsTab.emptyExpectation: "empty []"`, `evalsTab.errored: "errored"`, `evalsTab.confirmDelete: "Delete eval case \"{name}\"? Its run history is deleted too."`, `caseEditor.findingSkeleton: "Finding skeleton"`, `caseEditor.cancel: "Cancel"`, `caseEditor.neverRun: "Never run"`, `caseEditor.runCaseNeedsSave: "Save your changes before running this case"`, `caseEditor.contradictoryWarning: "A must_find and a must_not_flag item overlap: one finding would count as both found and noise."`, `caseEditor.schemaInvalid: "Doesn't match the expectation schema"`)
- **Layer:** n/a
- **Interfaces:**
  - `useAgentEvalsTab(agentId)` composes `useAgentEvalCases`, `useAgentEvalDashboard`, `useAgentEvalRuns`, `useStartEvalRun`, `useDeleteEvalCase`. It returns `{ cases, dashboard, isRunningAll, runningCaseId, runAll(), runCase(id), deleteCase(id), editor: { open(caseId | "new"), close(), current } }`. `isRunningAll` = some running run with `partial === false`. `runningCaseId` = the single id of a running partial run with `case_ids.length === 1`. Editor open state lives in `?case=<id|new>` (URL state convention).
  - `EvalsTab` renders the header ("Eval metrics" + subtitle + `Link` "View full dashboard" → `/eval/${agentId}`), `EvalMetricTiles showTraces`, the "Eval cases  N/M passing" heading, the buttons "Run all evals (N)" (shows `evalsTab.running` while `isRunningAll`; case count is visible before start, per the spec's Cost control) and "New eval case", and the list of `EvalCaseRow`. States: loading skeleton, `evalsTab.emptyCases` empty state, error state.
  - `EvalCaseRow({ c, running, onRun, onEdit, onDelete })` shows: status icon + text (passed / failed / errored / never run, never color-only); name; `expectedGot` or `neverRun`; chip (`summary.chip`) or `empty []`; `IconBtn`/`Button` run / edit / delete with `aria-label` = `evalsTab.run|edit|delete`. Delete goes through `window.confirm(t("evalsTab.confirmDelete"))` first.
  - `EvalCaseEditorModal({ agentId, caseId | null, onClose })` uses `Modal` from `@devdigest/ui`. Fields: Name (`TextInput`); `Tabs` Diff / PR meta (Diff = `Textarea` monospace; PR meta = title + body); Expected output `Textarea` with a badge `validJson`/`invalidJson`; "Finding skeleton" button; last-run status line (`lastRunPassed`/`lastRunFailed` + `resultSummary`, or `neverRun`); footer Cancel / Run case / Save.
  - `helpers.ts` (editor): `parseExpected(text): { ok: true; items: EvalExpectationItem[] } | { ok: false; reason: "json" | "schema" }`. It does a JSON parse plus a hand-written structural check mirroring `EvalExpectationItem` (no zod value import), and server-side Zod stays authoritative. `FINDING_SKELETON = { kind: "must_find", severity: "CRITICAL", category: "security", title: "", file: "", start_line: 1 }`, plus `appendSkeleton(text)` and `hasContradiction(items)`.
  - **Gating (AC-28):** Save and Run case are disabled while `!parse.ok`. Run case is also disabled for a new or dirty case (tooltip `runCaseNeedsSave`). Run case calls `runCase(caseId)` (partial run, AC-17).
- **Tests:** `EvalsTab.test.tsx` (fetch mocked via `jsonResponse` helper pattern, client INSIGHTS 2026-10-05): loading; empty; a never-run row; passed + failed rows with icon text; "Running…" when `/agents/:id/eval-runs` returns a running full run; four tiles render; "View full dashboard" href. `EvalCaseEditorModal.test.tsx`: invalid JSON shows the `invalid JSON` badge and disables Save + Run case; valid JSON enables Save; "Finding skeleton" inserts an item; schema-invalid (`[{"line":1}]`) disables Save. Use `fireEvent` (no user-event dependency, client INSIGHTS 2026-09-18).
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`, `security`
- **Depends on:** Steps 12, 14
- **Done when:** `/agents/<id>?tab=evals` renders the tab (manual) and the tests are green.

### Step 16 — Sidebar entry  ·  [frontend]
- **Files:** `client/src/vendor/ui/nav.ts` (edit, data-only: append `{ key: "eval", label: "Eval Dashboard", icon: "BarChart", href: "/eval" }` to SKILLS LAB **after** `conventions`; no `gKey`) · `client/src/components/app-shell/helpers.test.ts` (edit: assert `activeKeyFor("/eval") === "eval"` and `activeKeyFor("/eval/<uuid>") === "eval"`) · `client/src/vendor/ui/nav.test.ts` is **not** created (vendored tree); assert the NAV entry from `helpers.test.ts` by importing `NAV` from `@devdigest/ui`
- **Layer:** n/a
- **Skills to invoke:** `react-frontend-best-practices`, `react-testing-library`
- **Depends on:** nothing
- **Done when:** the sidebar shows "Eval Dashboard" under SKILLS LAB after Conventions, highlighted on `/eval` and `/eval/<id>`. Tests are green.

### Step 17 — Eval Dashboard pages (all agents + per agent) + Compare modal  ·  [frontend]
- **Files:**
  - `client/src/app/eval/page.tsx` (new, `"use client"`, thin)
  - `client/src/app/eval/styles.ts` (new)
  - `client/src/app/eval/_components/AgentEvalCard/{AgentEvalCard.tsx,index.ts,styles.ts}` (new)
  - `client/src/app/eval/_components/RecentEvalRunsTable/{RecentEvalRunsTable.tsx,index.ts,styles.ts}` (new)
  - `client/src/app/eval/[agentId]/page.tsx` (new, `useParams<{ agentId: string }>()` as in `agents/[id]/page.tsx:19`)
  - `client/src/app/eval/[agentId]/_hooks/useEvalRunSelection.ts` (new)
  - `client/src/app/eval/[agentId]/_components/AgentRunsTable/{AgentRunsTable.tsx,index.ts,styles.ts}` (new)
  - `client/src/app/eval/[agentId]/_components/RegressionBanner/{RegressionBanner.tsx,index.ts}` (new)
  - `client/src/app/eval/[agentId]/_components/CompareRunsModal/{CompareRunsModal.tsx,index.ts,styles.ts,helpers.ts,useCompareRuns.ts,CompareRunsModal.test.tsx}` (new)
  - `client/src/app/eval/_components/AgentEvalCard/AgentEvalCard.test.tsx` and `client/src/app/eval/[agentId]/_hooks/useEvalRunSelection.test.ts` (new)
  - `client/messages/en/eval.json` (edit: add `page.allAgents: "All agents"`, `page.switchAgent: "Agent"`, `dashboard.recentAllAgents: "RECENT EVAL RUNS · ALL AGENTS"`, `dashboard.table.agent/date/version/passCol`, `dashboard.partial: "partial"`, `dashboard.failedRun: "failed"`, `dashboard.na: "n/a"`, `dashboard.compare: "Compare"`, `dashboard.compareHint: "Select exactly two runs to compare"`, `dashboard.regression: "{metric} dropped {pp} pts in v{version} (vs v{previous})"`, `compare.title: "Compare runs · v{old} → v{new}"`, `compare.recall/precision/citation/cost`, `compare.promptDiff: "SYSTEM PROMPT DIFF"`, `compare.noPromptChange: "No prompt change (same agent version)."`, `compare.caseSetWarning: "These runs covered different case sets, so the deltas are not like-for-like."`, `compare.loadError: "One of the selected runs no longer exists."`, `compare.close: "Close"`)
- **Layer:** n/a
- **Interfaces:**
  - `/eval`: `AppShell crumb=[{label: t("page.crumbSkillsLab")}, {label: t("page.crumbEvalDashboard")}]`. Shows one `AgentEvalCard` per `agents[]` (name, model chip = the agent's real `model`, last-run `v{n} · date`, pass x/y, `Sparkline` of `trend` recall, RECALL/PREC/CITE via `formatRate` with `na`), each linking to `/eval/<agentId>`. Below that, `RecentEvalRunsTable` (agent, date, version, recall/precision/cite as `BarRow` bars, pass x/y, "partial"/"failed" tags), newest first. When `recent_runs` is empty, show `EmptyState` with `dashboard.noRuns` (AC-30).
  - `/eval/[agentId]`: crumb Skills Lab › Eval Dashboard (href `/eval`) › agent name. Has an "All agents" back link, an agent switcher (`SelectInput` over the `useAgents()` entries that have cards, `router.push`), and a "Run eval (N)" button (`useStartEvalRun`, "Running…" from server state). `RegressionBanner` renders when `regression` is set (copy from `dashboard.regression`, metric label from `dashboard.legend.*`, `pp = (drop*100).toFixed(1)`). Below that: `EvalMetricTiles` (3 tiles), METRIC TREND `LineChart` with 3 series (recall/precision/citation from `dashboard.trend`, `yMin` = `Math.min(0.6, minValue)`), and `AgentRunsTable` (ran at, version, recall, precision, citation, pass, cost via `lib/format.ts` cost formatter if present else `formatCost` helper, "—" for null; checkbox per row via `Checkbox`). The `Compare` button is enabled iff `selected.length === 2` (AC-32).
  - `useEvalRunSelection()` → `{ selected: string[], toggle(id), clear() }`. Toggling a 3rd id drops the **oldest-selected** one (spec edge).
  - `CompareRunsModal({ runIds: [string, string], onClose })` gets data from `useCompareRuns`, which fetches both via `useEvalRun`. `helpers.ts`: `orderOldNew(a, b)` by `started_at` (AC-33, never click order); `metricDeltas(old, new)` → rates in pp with sign, cost in USD; `diffLines(a: string, b: string): { kind: "same" | "add" | "del"; text: string }[]` (pure LCS line diff); `sameCaseSet(a.case_ids, b.case_ids)`. Renders `old → new` + signed delta for recall, precision, citation, cost. The prompt diff comes from `config.system_prompt` of both runs (K2) and renders as plain text in a `<pre>`: one `<div>` per line with `+`/`−`/` ` prefix and add/del background, **no** markdown/HTML interpretation. If `old.agent_version === new.agent_version`, show `compare.noPromptChange` (AC-34); if `!sameCaseSet`, show `compare.caseSetWarning`; on 404, show `compare.loadError`. The footer has Close only.
- **Tests:** `CompareRunsModal.test.tsx`: given two mocked runs (newer selected first), the title reads `v6 → v7` in `started_at` order; deltas are signed (`+2.0 pts`, `−4.0 pts`); the diff shows the `+` and `−` lines; same version → "No prompt change"; different case sets → warning; one 404 → error state. `useEvalRunSelection.test.ts`: Compare is enabled only at exactly 2, and the 3rd selection replaces the oldest. `AgentEvalCard.test.tsx`: renders model and pass x/y, and "n/a" when `na` is set. An empty-state test for `/eval` page with `recent_runs: []` → `noRuns` text.
- **Skills to invoke:** `next-best-practices`, `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`, `security` (plain-text diff rendering)
- **Depends on:** Steps 12, 14, 16
- **Done when:** `/eval` and `/eval/<securityReviewerId>` render against a seeded dev stack, and the tests are green.

### Step 18 — Root `package.json` + `scripts/verify-l06.mjs`  ·  [full-stack]
- **Files:** `package.json` (new, repo root) · `scripts/verify-l06.mjs` (new)
- **Layer:** n/a (tooling)
- **Interfaces:**
  - `package.json`: `{ "name": "devdigest-course", "private": true, "type": "module", "scripts": { "verify:l06": "node scripts/verify-l06.mjs" } }`. No `dependencies`, no `workspaces`, no `packageManager`. **Do not** create `pnpm-workspace.yaml` or a root lockfile, and if pnpm writes a stray `pnpm-workspace.yaml` anywhere, delete it (root INSIGHTS 2026-10-04).
  - `scripts/verify-l06.mjs`: Node ≥ 22 ESM using only `node:child_process`, `node:fs`, `node:path`, `node:url`. `ROOT = fileURLToPath(new URL('..', import.meta.url))`. `run(label, cmd, args, cwd)` uses `spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })` (Windows needs the shell to resolve `pnpm.cmd`). Print `▶ [n/8] label` before each step. On non-zero status, print `✗ label failed` and `process.exit(1)` immediately (first failure stops, AC-40). The script runs offline: it never sets keys, never runs the `evals/` harness, and calls no model. Steps in order:
    1. Typecheck: `pnpm typecheck` in `server/`, `pnpm typecheck` in `client/`; reviewer-core via `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` in `reviewer-core/` (bypasses pnpm's pre-script install that fails on Windows, reviewer-core INSIGHTS 2026-09-18).
    2. `node node_modules/vitest/vitest.mjs run` in `reviewer-core/`.
    3. `pnpm exec vitest run --exclude "**/*.it.test.ts"` in `server/`.
    4. Integration lane: first `spawnSync('docker', ['info'], { stdio: 'ignore', shell })`. On non-zero, fail with "Docker is required for the server integration lane (it-tests self-skip without it, which would make this gate vacuous)". Then `pnpm exec vitest run .it.test` in `server/`.
    5. `pnpm test` then `pnpm lint` in `client/`.
    6. Vendored parity (CRLF-normalized `s.replace(/\r\n/g, '\n')`):
       - (a) `contracts/eval-pipeline.ts` is identical in `server/src/vendor/shared` and `client/src/vendor/shared`.
       - (b) the `knowledge.ts` slice from `// ---- Eval ----` up to `// ---- Memory ----` is identical.
       - (c) the `eval-ci.ts` slice from `// Eval — case input + persisted run record + dashboard` up to `// Compose Review` is identical.
       - (d) both `index.ts` contain `export * from './contracts/eval-pipeline.js';`.
       - On a mismatch, print the first differing line number.
    7. Migration hygiene:
       - (a) Snapshot `readdirSync('server/src/db/migrations')` and `.../meta`, run `pnpm db:generate` in `server/`, and re-list. Any new file → fail with "schema and migrations are out of sync: drizzle-kit generated <files>". Leave the files for the developer to review and **don't** delete them.
       - (b) `base = git merge-base HEAD origin/main` (fallback `HEAD` if that fails). For every `*.sql` and `meta/*_snapshot.json` that exists at `base` (`git ls-tree --name-only <base> server/src/db/migrations/ server/src/db/migrations/meta/`), `git diff --quiet <base> -- <file>` must exit 0.
       - (c) Parse `git show <base>:server/src/db/migrations/meta/_journal.json` and the working copy, and assert every base entry is deep-equal at the same index of the current `entries` (append-only).
    8. Structural: `specs/eval-pipeline.md` exists, and `client/src/vendor/ui/nav.ts` contains a NAV item with `key: "eval"` and `href: "/eval"` (regex).
    End with `✓ verify:l06 passed (8/8)` and exit 0.
- **Skills to invoke:** `typescript-expert`, `security` (child-process spawning, no secrets in env)
- **Depends on:** Steps 1–17
- **Done when:** `pnpm verify:l06` at the repo root exits 0 with Docker running. Temporarily breaking one parity line makes it exit 1 at step 6, and the remaining steps don't run.

### Step 19 — Contract docs + insights wrap-up  ·  [full-stack]
- **Files:** `server/specs/api-contract.md` (edit: append an "Eval (L06)" route table matching Step 9) · `client/specs/ui-flows.md` (edit: append `/eval`, `/eval/[agentId]`, `/agents/[id]?tab=evals`, FindingCard action) · `INSIGHTS.md` / package `INSIGHTS.md` via the skill (append-only)
- **Layer:** n/a
- **Skills to invoke:** `engineering-insights`
- **Depends on:** Step 18
- **Done when:** both spec docs list the new surface. Insights recorded: seeded agents have no v1 `agent_versions` snapshot (why K2 exists), and the seeded review has no `agentId`.

---

## Contract changes
- `server/src/vendor/shared/contracts/eval-pipeline.ts` (new) **and** `client/src/vendor/shared/contracts/eval-pipeline.ts` (new), identical.
- `server/src/vendor/shared/index.ts` **and** `client/src/vendor/shared/index.ts`: one appended `export *` line + a header-comment line each.
- `knowledge.ts` / `eval-ci.ts`: **no edits** in either copy (AC-37). Their eval sections are only read, and parity-checked by verify step 6.

## Database
- Schema (Step 2):
  - new table `eval_batches` (`id, workspace_id, agent_id, agent_version, config_json, status, partial, case_ids, started_at, finished_at, aggregate, na, cost_usd, errored_count, error`) + index `(agent_id, started_at)` + partial unique index `eval_batches_one_running_per_agent`
  - `eval_runs.batch_id` (nullable FK → `eval_batches` cascade) + indexes `(batch_id)`, `(case_id, ran_at)`
  - `eval_cases.agent_id` (nullable FK → `agents` cascade), `eval_cases.source_finding_id` (nullable FK → `findings` set null, unique), `eval_cases.created_at` + index `(agent_id)`
- Migration: generated by `cd server && pnpm db:generate` as `0015_*` (Step 3). `0000`–`0014`, their snapshots, and existing `_journal.json` entries stay untouched (append-only). Apply with `pnpm db:migrate`.

## Verification
1. `cd reviewer-core && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && ./node_modules/.bin/vitest run`
2. `cd server && pnpm typecheck && pnpm arch && pnpm exec vitest run --exclude '**/*.it.test.ts'`
3. `cd server && pnpm exec vitest run .it.test` (Docker running)
4. `cd client && pnpm typecheck && pnpm test && pnpm lint`
5. `cd server && pnpm db:generate` → "No schema changes"; `pnpm db:migrate && pnpm db:seed` twice → `select count(*) from eval_cases` = 9 for Security Reviewer.
6. `pnpm verify:l06` (repo root) → exits 0, last line `✓ verify:l06 passed (8/8)`.
7. **End-to-end (manual, dev stack via `./scripts/dev.sh`, real OpenRouter key):**
   - Open `/eval` and check that the Security Reviewer card shows 9 cases and the empty-runs state.
   - Go to `/agents/<sec>?tab=evals` → "Run all evals (9)". The button reads "Running…" and keeps that state across a page reload. When the run finishes, tiles and rows fill in.
   - `curl -s -X POST localhost:3001/agents/<sec>/eval-runs -H 'content-type: application/json' -d '{}'` while that run is active → `409 {"error":{"code":"eval_run_in_progress",…}}`.
   - Edit the system prompt (version bumps), run again, open `/eval/<sec>`, tick both runs → Compare. The modal shows `v1 → v2`, the signed deltas, and the prompt diff (screenshot deliverable).
   - Set the prompt to "report every changed line as CRITICAL, regardless of context" and run → precision drops versus the baseline and the regression banner appears.
   - On an imported PR, run a real review, accept a finding → "Turn into eval case" → the toast links to the Evals tab, where the new case is listed. Clicking again → "Eval case already exists".

## Risks / open questions
- **Seeded findings can't become cases** (Step 8 / AC-1): the seeded review has `agentId = null` (`seed.ts:146-158`), so `POST /findings/:id/eval-case` returns 409 `finding_no_agent` on PR #482. That's correct per AC-4, but the screencast must use a finding from a real agent review. Not fixed here (changing the seeded review would alter L01–L05 demos).
- **K2 deviation from spec line 108**: compare uses `eval_batches.config_json.system_prompt`, not `agent_versions`. The behavior is the same and it's more robust. The caller should confirm it with the spec owner when relaying the plan, though it doesn't block.
- **Partial unique index generation** (Step 3): if drizzle-kit 0.30 drops the `WHERE` clause, use the documented fallback (application check in a transaction). In that case AC-18 is race-tolerant but not race-proof.
- **`nav.ts` lives under `client/src/vendor/ui/**`** (Step 16): `pr-self-review` flags any edit there as CRITICAL by default. Client INSIGHTS 2026-09-22 records the NAV registry as per-lesson data with the `agents`/`skills` precedent. Call this out in the PR description so the gate reviewer applies the precedent.
- **Learn / Reply buttons don't exist** in `FindingCard` (`FindingCard.tsx:91-112`), even though mockup 1 places the new action between them. The action goes after Dismiss.
- **Integration lane runs all `*.it.test.ts`** (verify step 4), not just eval, so it's slow but matches the spec's wording. `reviews.it.test.ts` is hermetic since its `MockSecretsProvider` fix (server INSIGHTS 2026-09-28).
- **Cost of an eval run with a real key** = one review per case (9 calls for the seed). The case count shows on the button before start. There's no cancel for eval runs (out of scope); a stuck run is reaped on the next boot.
- **Errored cases are excluded from the cost sum** (Step 4): the spec says "sum of case costs", but an errored case has no outcome. This is documented in the scoring docblock.
- **`Container.loadPrDiff` imports `reviews/diff-loader.ts`** (Step 5): no runtime cycle because diff-loader only type-imports `Container`. If `pnpm arch` reports `no-circular`, move the method body into a small `platform/pr-diff.ts` that both import, rather than loosening the rule.
- Adjacent, NOT planned: giving seeded agents a v1 `agent_versions` snapshot; updating `pr-self-review`'s path map for `server/src/db/seed*.ts` and root `scripts/**` (neither has a row today); the stale `.claude/skills/README.md` symlink note.

## Do-not-touch confirmations
- `server/src/db/migrations/**`: only the generated `0015_*` files and the tool-appended journal entry. No manual edits, and verify step 7 enforces this.
- `client/src/vendor/ui/**`: only the data-only `NAV` entry in `nav.ts` (precedent above). No primitive/kit/chart file is edited. Everything new imports from the `@devdigest/ui` barrel.
- `server/src/vendor/shared/**` / `client/src/vendor/shared/**`: a new file in both copies + one barrel line in both. Existing contract files are untouched.
- `skills-lock.json`: not touched.
- Lesson scaffolding (`eval_cases`/`eval_runs` tables, eval contracts, `eval.json` namespace): consumed and extended additively, nothing deleted. Other L02–L08 scaffolding (`ci`, `conformance_checks`, `composed_reviews`, CI contracts) is untouched.
- `server/clones/**`, `client/.next/**`, `**/test-results/**`: not written. Eval runs never read clones (frozen inputs only).
- `server/package.json` (skip-worktree): **not edited**. The gate lives in the new root `package.json` (D4).
