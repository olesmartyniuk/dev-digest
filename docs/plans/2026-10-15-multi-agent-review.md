# Plan — Multi-Agent Review (SPEC-05)
**Spec:** `specs/SPEC-05-multi-agent-review.md` (verified in Step 0: no `[NEEDS CLARIFICATION]` markers, `Open questions: none`, D1–D22 settled; every AC maps onto an existing module, table or component, or is explicitly new)
**Request:** Implement SPEC-05: pick several agents (PR-page picker + Configure run screen), start one multi-agent review under a `multi_agent_runs` parent, and show per-agent results (Columns, Tabs + detail) with grouped findings, a "Where agents disagree" block and up-front time/cost estimates.
**Status:** READY FOR IMPLEMENTER
**Packages touched:** server · client · shared (×2). reviewer-core, e2e, devdigest-mcp: none.
**Out of scope:**
- Any change to `reviewer-core/` (it is imported, never edited), `ci/`, `agent-runner/` (neither exists here; no-touch rule).
- Any change to `ReviewRunExecutor`'s execution model. It runs agents **sequentially** (`server/src/modules/reviews/run-executor.ts:124-151`). The spec forbids a new parallel-execution mechanism (Non-goals), so this plan does not add one. See Risks R1.
- A new start endpoint. `POST /pulls/:id/review` is extended (D2).
- Learn / Reply to author actions (D4); history list of parent runs (D20); cost confirmation step (D18).
- Editing `server/src/vendor/shared/contracts/observability.ts` (D14). Its `Conflict` docblock (lines 61-65) already documents the conflict definition AC-22 points at, so it needs no edit.
- e2e flows. The spec has no e2e AC, and runs need an LLM (keyless runs only fail). No `e2e/` file changes.
- MCP (`devdigest-mcp/`) support for `agentIds`.
- Moving `FindingCard` / `RunTraceDrawer` out of the PR route into `src/components/` (see Risks R5).
**Sources read:** `specs/SPEC-05-multi-agent-review.md`; root `CLAUDE.md`, `INSIGHTS.md`; `server/CLAUDE.md`, `server/INSIGHTS.md`; `client/CLAUDE.md`, `client/INSIGHTS.md`; `specs/review-flow.md` (R1–R8, P2/P3); `TESTING.md`; `server/.dependency-cruiser.cjs`; `server/src/db/schema/runs.ts`, `schema/agents.ts`; `server/src/vendor/shared/index.ts`, `contracts/{observability,review-api,findings,platform}.ts`; `server/src/modules/index.ts`, `_shared/schemas.ts`; `server/src/modules/reviews/{routes,service,run-executor,findings,helpers,repository}.ts`, `reviews/repository/{run,review}.repo.ts`; `server/src/modules/agents/{repository,constants}.ts`; `server/src/modules/eval/{routes,service}.ts`; `server/src/platform/container.ts` (reviewRepo/agentsRepo getters); `server/src/app.ts` (error handler); `server/test/reviews.it.test.ts`; `reviewer-core/src/eval/score.ts` exports via `reviewer-core/src/index.ts:72-73`; `client/src/app/repos/[repoId]/pulls/[number]/{page.tsx,_hooks/usePrDetail.ts}` and `_components/{RunReviewDropdown,PrDetailHeader,FindingCard,RunTraceDrawer}`; `client/src/lib/{api.ts usage,format.ts,providers.tsx,repo-context.tsx}`, `lib/hooks/{index,core,reviews,eval}.ts`; `client/src/components/app-shell/{helpers.ts,helpers.test.ts}`; `client/src/vendor/ui/{index.ts,nav.ts,kit/Checkbox,kit/Tabs,kit/Popover,kit/SearchableSelect,primitives/Toggle,primitives/CircularScore,primitives/ConfidenceNum}`; `client/messages/en/{runs,shell,prReview}.json`; `.claude/skills/pr-self-review/SKILL.md` (skill map); `server/specs/api-contract.md:38`.

## Context

**What exists today**
- `POST /pulls/:id/review` (`server/src/modules/reviews/routes.ts:27-44`) parses `RunRequest` (`{agentId?, all?}`, `server/src/vendor/shared/contracts/platform.ts:276-280`) by hand (`RunRequest.parse(req.body ?? {})`; a `ZodError` becomes 422 in `server/src/app.ts:145-160`), resolves targets (`ReviewService.resolveTargets`, `service.ts:46-57`), then `ReviewService.runReview` (`service.ts:103-138`) creates one `agent_runs` row per agent **before** any LLM call (R1) and fires `ReviewRunExecutor.executeRuns` fire-and-forget. The route carries a 10/min rate limit (`routes.ts:29`), which stays.
- `agent_runs` (`server/src/db/schema/runs.ts:8-33`) has `status` ∈ running/done/failed/cancelled (R2), `duration_ms`, nullable `cost_usd` (always null on failed/cancelled runs, `server/INSIGHTS.md` 2026-09-17), `score`, `error`. There is **no** column linking to `multi_agent_runs`.
- `reviews` rows carry `run_id` (no FK) + `agent_id`, `verdict`, `summary`, `score`. Findings hang off `reviews` (`reviews/repository/review.repo.ts:29-74`). A failed run's half-written review is deleted (`deleteReviewByRunId`), so a failed run has no findings.
- Finding actions: `POST /findings/:id/accept|dismiss` (`reviews/routes.ts:143-149`). `POST /findings/:id/eval-case` (`eval/routes.ts:124-137`) returns **409** unless the finding is already accepted or dismissed (`eval/service.ts:157-164`).
- `normalizeEvalPath` and `rangesOverlap` are exported from `@devdigest/reviewer-core` (`reviewer-core/src/index.ts:72-73`). `server/src/modules/eval/helpers.ts:1` already imports one of them from a domain-ring `helpers.ts` without an arch violation.
- The executor runs agents **one after another** (`run-executor.ts:124`, `for … await`).

**Scaffolding that gets consumed (do not recreate)**
- Table `multi_agent_runs` (`server/src/db/schema/runs.ts:43-52`, already in `migrations/0000_init.sql:198`). It is reused as the parent row. Only `agent_runs` gets a new column.
- `client/messages/en/runs.json` already holds multi-agent strings: `column.noFindings`, `column.findingsCount`, `conflicts.{title,onlyConflicts,empty,didNotFlag}`, `tabs.noSummary`, `page.{title,selectPr,prItem,noAgents.*,crumb}`, `viewTrace`. **Add** keys to this namespace. Do not create a new namespace, and do not delete unused keys (`page.meta`'s "fan-out via p-queue" copy is left in place but unused, per D8).
- `client/messages/en/shell.json:26` already has `nav["multi-agent"]`. `client/src/components/app-shell/helpers.ts:28` already maps any path containing `/multi-agent` to the `"multi-agent"` sidebar key. The new routes therefore live under `/multi-agent…`.
- `RunTraceDrawer` (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/`) and `LiveLogStream` (`@devdigest/ui`) are reused unchanged (AC-32).
- `FindingCard` (same `_components/` folder) already renders exactly AC-28/29's expandable row: severity, title, category, `file:line`, `ConfidenceNum` (= `Math.round(confidence*100)%`, D12), rationale, suggestion only when present, Accept / Dismiss / Turn into eval case (disabled until decided). It is reused unchanged.
- `useTurnIntoEvalCase` (`client/src/lib/hooks/eval.ts:153`), `useFindingAction`, `useRunEvents`, `usePulls`, `useAgents`, `useActiveRepo`, `formatCostUsd` (`client/src/lib/format.ts:10`) and the vendored `Checkbox`, `Toggle`, `Tabs`, `Popover`, `SearchableSelect`, `CircularScore`, `SeverityBadge`, `EmptyState`, `Skeleton`, `Button` are all reused.
- Existing contracts `MultiAgentRun`, `AgentColumn` and `Conflict` in `observability.ts` are **left as they are** (their documented routes never existed). The new file carries the richer shapes (D14).

**What is missing:** the parent link column + migration; the `agentIds` request form; the read API (run view, latest, estimates); grouping/conflict/reason logic; the picker, Configure run screen, results page and sidebar entry.

## Planner decisions (the two spec-level items plus the gaps the spec leaves to the planner)

- **PD-1, duplicate agent ids (AC-17a): reject.** `ReviewStartRequest` rejects an `agentIds` array with duplicates with **422** (Zod `superRefine`). An empty array is also 422 (`.min(1)`), as is a non-uuid id (`.uuid()`). A well-formed id that is not an agent in the workspace returns **404** `Agent not found`. All checks run before any row is inserted, so no runs are created. Disabled-but-existing agents are **accepted**, the same as the existing `agentId` form (`service.ts:51-55`). Mixing `agentIds` with `agentId` or `all` returns 422.
- **PD-2, chained overlap (edge case): transitive, by sweep.** Group per normalized path (`normalizeEvalPath`). Sort that file's findings by `(min(start,end), max(start,end), column order, finding id)`. Sweep with a running group span `[gs, ge]`: a finding joins the current group iff `rangesOverlap([gs, ge], [s, e])`, and then `ge = max(ge, e)`. Otherwise it starts a new group. Result: A–B–C chains form **one** group (connected components of the overlap graph). Input order does not affect the result. Same-agent overlapping findings join the same group too, and AC-30 fan-out then covers both.
- **PD-3, D3 reason derivation.** Agents have no scope/category column (`schema/agents.ts:8-36`), so "the agent's scope" is derived deterministically:
  1. The first keyword match in `"${name} ${description}"` against `SCOPE_KEYWORDS` (constants), mapped to a `FindingCategory`.
  2. Otherwise, the agent's most frequent finding category in this run (ties broken by `FindingCategory` enum order).
  3. Otherwise `null`, which means the generic reason.

  The server returns only the **scope key**. The client renders the sentence from i18n (`runs.conflicts.reason.<scope|general>`), so no strings live on the server.
- **PD-4, disagreement block visibility (D19 + edge "one agent").** `locations` are computed only when **≥ 2 columns are `done`**. Otherwise the array is empty and the block is hidden. When locations exist but the "only conflicts" toggle is ON and none is a conflict, the block stays visible and shows the existing `runs.conflicts.empty` string, so the toggle can still be switched back. The toggle defaults to **OFF** and is kept in the URL (`?only=conflicts`).
- **PD-5, take semantics.** Takes are built only for `done` columns (AC-24a: failed, cancelled, queued and running agents are omitted, never "did not flag"). An agent with several findings in one group reports the **highest** severity among them. `is_conflict = anyDidNotFlag || distinct(flagged severities) > 1`. A location's `file`, `line` and `title` come from the group's representative: its highest-severity finding, with ties broken by column order and then finding id. `line` = the group's `gs`.
- **PD-6, status mapping (D13).** Server column status = `agent_runs.status` when it is one of running/done/failed/cancelled, otherwise `queued`. Because the executor is sequential, not-yet-started agents still show `running` (R1/R2 rows are created as `running`). `queued` exists in the contract for forward compatibility only.
- **PD-7, estimates (D16).** Per enabled agent, take the most recent 10 `done` runs (any PR, workspace-scoped) by `ran_at desc`. `mean_duration_ms` = SQL `avg(duration_ms)` and `mean_cost_usd` = `avg(cost_usd)` (SQL `avg` ignores nulls, so the mean is over known costs). If there are no rows, or all values are null, the value is `null`, rendered as "unavailable".
- **PD-8, column order.** Columns are ordered by `lower(agent name)`, then `run_id`. All rows created in one transaction share the same `ran_at`, so ran_at cannot order them.
- **PD-9, PR-page picker replaces the dropdown menu.** The "Run Review" trigger opens the AC-1 panel (a `Popover`). The legacy "Run all enabled agents" and per-agent items are removed from this UI, but the API forms stay (AC-17; MCP still uses them). "Configure agents…" now goes to `/multi-agent/configure?pr=<prId>` (AC-5).
- **PD-10, cross-route reuse.** The results page imports `RunTraceDrawer` and `FindingCard` from their existing PR-route barrels (`@/app/repos/[repoId]/pulls/[number]/_components/<Name>`) instead of re-implementing them (AC-32). The pattern has precedent: `@/app/agents/constants` is imported cross-route at `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/constants.ts:4`.

## Steps

### Step 1 — New shared contract file, both vendored copies  ·  [full-stack]
- **Files:** `server/src/vendor/shared/contracts/multi-agent.ts` (new) · `client/src/vendor/shared/contracts/multi-agent.ts` (new, byte-identical) · `server/src/vendor/shared/index.ts` (edit: add `export * from './contracts/multi-agent.js';` after the `observability.js` line, and add a `contracts/multi-agent` line to the header comment) · `client/src/vendor/shared/index.ts` (same edit)
- **Layer:** n/a (contracts)
- **Interfaces** (imports: `z` from `zod`; `Severity`, `FindingCategory`, `Verdict` from `./findings.js`; `FindingRecord`, `ReviewRunResponse` from `./review-api.js`; `RunRequest` from `./platform.js`):
  ```ts
  // ---- start (D2) ----
  export const ReviewStartRequest = RunRequest.extend({
    agentIds: z.array(z.string().uuid()).min(1).optional(),
  }).superRefine((b, ctx) => {
    if (b.agentIds && (b.agentId !== undefined || b.all !== undefined))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['agentIds'],
        message: 'Provide exactly one of agentId, all, agentIds' });
    if (b.agentIds && new Set(b.agentIds).size !== b.agentIds.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['agentIds'],
        message: 'agentIds must not contain duplicates' });
  });
  export type ReviewStartRequest = z.infer<typeof ReviewStartRequest>;
  export const ReviewStartResponse = ReviewRunResponse.extend({
    /** Present only for the agentIds form (D6). */
    multi_agent_run_id: z.string().optional(),
  });
  export type ReviewStartResponse = z.infer<typeof ReviewStartResponse>;

  // ---- results view ----
  export const MultiAgentRunStatus = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);
  export const MultiAgentFinding = FindingRecord.extend({
    run_id: z.string(), agent_id: z.string().nullable(), group_id: z.string(),
  });
  export const MultiAgentColumn = z.object({
    run_id: z.string(), agent_id: z.string().nullable(), agent_name: z.string().nullable(),
    provider: z.string().nullable(), model: z.string().nullable(),
    status: MultiAgentRunStatus, error: z.string().nullable(),
    verdict: Verdict.nullable(), summary: z.string().nullable(), score: z.number().int().nullable(),
    duration_ms: z.number().int().nullable(), cost_usd: z.number().nullable(),
    findings: z.array(MultiAgentFinding),
  });
  export const MultiAgentGroup = z.object({
    id: z.string(), file: z.string(), start_line: z.number().int(), end_line: z.number().int(),
    title: z.string(), severity: Severity,
    finding_ids: z.array(z.string()), run_ids: z.array(z.string()), // contributors, column order
  });
  export const MultiAgentTake = z.object({
    run_id: z.string(), agent_id: z.string().nullable(), agent_name: z.string().nullable(),
    verdict: z.union([Severity, z.literal('did_not_flag')]),
    /** Only for did_not_flag: the agent's derived scope (PD-3); null → generic reason. */
    scope: FindingCategory.nullable(),
  });
  /** Conflict definition = observability.ts `Conflict` docblock (AC-22). */
  export const MultiAgentLocation = z.object({
    group_id: z.string(), file: z.string(), line: z.number().int(), title: z.string(),
    is_conflict: z.boolean(), takes: z.array(MultiAgentTake),
  });
  export const MultiAgentRunView = z.object({
    id: z.string(), pr_id: z.string(), pr_number: z.number().int(), pr_title: z.string(),
    repo_id: z.string(), ran_at: z.string(), agent_count: z.number().int(),
    total_duration_ms: z.number().int().nullable(), // D10: max of persisted durations
    total_cost_usd: z.number().nullable(),           // D10: sum of known costs
    cost_complete: z.boolean(),                       // AC-33: false if any column cost is null
    in_flight: z.boolean(),                           // any column queued|running
    columns: z.array(MultiAgentColumn), groups: z.array(MultiAgentGroup),
    locations: z.array(MultiAgentLocation),
  });
  export const MultiAgentLatestResponse = z.object({ id: z.string().nullable() });
  // ---- estimates (D16) ----
  export const AgentRunEstimate = z.object({
    agent_id: z.string(), sample_size: z.number().int(),
    mean_duration_ms: z.number().nullable(), mean_cost_usd: z.number().nullable(),
  });
  ```
  Export a `type X = z.infer<typeof X>` for every schema. Add a top docblock naming SPEC-05 and stating that `observability.ts` is deliberately untouched.
- **Skills to invoke:** `zod`, `typescript-expert`
- **Depends on:** nothing
- **Done when:** both new files have identical content. Per root `INSIGHTS.md` 2026-10-05, the vendored tree is CRLF and a tool-written new file is LF, so normalize both new files to CRLF before diffing. `git diff --no-index server/src/vendor/shared/contracts/multi-agent.ts client/src/vendor/shared/contracts/multi-agent.ts` must print nothing. `cd server && pnpm typecheck` and `cd client && pnpm typecheck` pass.

### Step 2 — Link `agent_runs` to `multi_agent_runs` + generated migration  ·  [backend]
- **Files:** `server/src/db/schema/runs.ts` (edit) · `server/src/db/migrations/0016_*.sql` + `meta/_journal.json` + `meta/0016_snapshot.json` (generated, never hand-written)
- **Layer:** infrastructure (persistence schema)
- **Interfaces:** move the `multiAgentRuns` table definition **above** `agentRuns` (a plain reorder, so the reference is not forward). On `agentRuns`, add
  `multiAgentRunId: uuid('multi_agent_run_id').references(() => multiAgentRuns.id, { onDelete: 'set null' })` (nullable: legacy and single/all runs stay parentless, D6 and Non-goals). Add a table config arg `(t) => ({ multiAgentRunIdx: index('agent_runs_multi_agent_run_id_idx').on(t.multiAgentRunId) })` and import `index` from `drizzle-orm/pg-core`. Add a doc comment: "SPEC-05 parent; null for single/all runs".
- **Skills to invoke:** `drizzle-orm-patterns`, `postgresql-table-design`
- **Depends on:** nothing
- **Done when:** `cd server && pnpm db:generate` emits exactly one new migration containing `ALTER TABLE "agent_runs" ADD COLUMN "multi_agent_run_id" uuid`, the FK with `ON DELETE set null`, and the `CREATE INDEX`. No existing migration file and no existing `_journal.json` entry changed (`git diff --stat server/src/db/migrations` shows only additions). `pnpm db:migrate` applies cleanly. This diff only adds columns, so drizzle-kit should not prompt (cf. `server/INSIGHTS.md` 2026-09-23).

### Step 3 — Persist a parent run + its agent runs atomically  ·  [backend]
- **Files:** `server/src/modules/reviews/repository/run.repo.ts` (edit) · `server/src/modules/reviews/repository.ts` (edit)
- **Layer:** persistence
- **Interfaces:**
  - `run.repo.ts`: `export async function createMultiAgentRunWithRuns(db: Db, values: { workspaceId: string; prId: string; agents: { id: string; provider: string | null; model: string | null }[] }): Promise<{ multiAgentRunId: string; runIds: Map<string, string> /* agentId → runId */ }>`. Inside `db.transaction(async (tx) => …)`, insert the `multi_agent_runs` row (`returning id`), then **one** multi-row insert into `agent_runs` with `status: 'running'`, `source: 'local'`, `multiAgentRunId`, and the same fields as `createAgentRun` (`run.repo.ts:117-140`), `returning({ id, agentId })`.
  - `ReviewRepository.createMultiAgentRunWithRuns(values)`: a thin delegate, placed beside `createAgentRun` (`repository.ts:161-169`).
- **Skills to invoke:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`
- **Depends on:** Step 2
- **Done when:** typecheck passes. The Step 10 it-test shows that one call creates 1 parent + N children sharing `multi_agent_run_id`, and that a failure inside the transaction leaves no rows.

### Step 4 — Extend the start path (`agentIds`)  ·  [backend]
- **Files:** `server/src/modules/reviews/service.ts` (edit) · `server/src/modules/reviews/routes.ts` (edit)
- **Layer:** application (service) · presentation (routes)
- **Interfaces:**
  - `service.ts`: new `async startReview(workspaceId: string, prId: string, body: ReviewStartRequest, logger?: Logger): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[]; multi_agent_run_id?: string }>`.
    - If `body.agentIds`: `resolveAgentIds(workspaceId, ids)` (new private method) loads each id with `this.agents.getById`. On the first miss it throws `NotFoundError('Agent not found')` before any insert. It then calls `runReview(workspaceId, prId, targets, logger, { multiAgent: true })`.
    - Otherwise it calls the existing `resolveTargets` + `runReview` unchanged (AC-17).
  - `runReview` gains `opts: { multiAgent?: boolean } = {}`. When `multiAgent`, after `getPull`/`getRepo` (so a bad PR still 404s with no rows), it calls `this.repo.createMultiAgentRunWithRuns(...)` instead of the per-agent `createAgentRun` loop. It builds `runs`/`jobs` in `targets` order from the returned map, fires `executor.executeRuns` exactly as today (`service.ts:133-135`), and returns `{ runs, reviews: [], multi_agent_run_id }`. The non-multi branch is byte-for-byte the current behaviour (no `multi_agent_run_id` key).
  - `routes.ts`: replace the `RunRequest` import and parse with `ReviewStartRequest.parse(req.body ?? {})` (keep the tolerant manual parse and its comment). The handler becomes `const result = await service.startReview(workspaceId, req.params.id, body, req.log); return { pr_id: req.params.id, ...result };`. Keep the rate-limit config untouched (D18). Update the header route comment: `{agentId} | {all:true} | {agentIds:[…]}`.
- **Skills to invoke:** `onion-architecture`, `fastify-best-practices`, `security`, `zod`, `typescript-expert`
- **Depends on:** Steps 1, 3
- **Done when:** `pnpm typecheck` and `pnpm arch` pass. The Step 10 it-tests cover all of these:
  - `{agentIds:[a,b]}` returns 200 with `multi_agent_run_id` and 2 runs sharing it.
  - Duplicates, `[]`, a non-uuid id, and a mixed body (`agentIds` with `agentId` or `all`) each return 422, with no new `agent_runs` or `multi_agent_runs` rows.
  - An unknown uuid returns 404 and creates no rows.
  - `{all:true}` and `{agentId}` create runs with `multi_agent_run_id IS NULL`, no parent row, and no `multi_agent_run_id` key in the response.

### Step 5 — `multi-agent` module: pure domain helpers + constants  ·  [backend]
- **Files:** `server/src/modules/multi-agent/constants.ts` (new) · `server/src/modules/multi-agent/helpers.ts` (new)
- **Layer:** domain (must not import fastify, drizzle, `src/db/`, adapters or container; `no-domain-outward`)
- **Interfaces:**
  - `constants.ts`: `ESTIMATE_SAMPLE_SIZE = 10`; `MIN_DONE_FOR_DISAGREEMENT = 2`; `SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 }`; `TERMINAL_OR_RUNNING_STATUSES = ['running','done','failed','cancelled'] as const`; `SCOPE_KEYWORDS: ReadonlyArray<readonly [FindingCategory, RegExp]>` in this order: `['security', /secur|vuln|auth|secret|inject|xss|csrf/i]`, `['perf', /perf|latency|speed|memory|efficien|n\+1/i]`, `['test', /\btest|coverage/i]`, `['style', /style|lint|convention|format|readab/i]`, `['bug', /bug|correct|logic/i]`.
  - `helpers.ts` (import `normalizeEvalPath`, `rangesOverlap` from `@devdigest/reviewer-core`, as `eval/helpers.ts:1` does; import types only from `@devdigest/shared`):
    - `toColumnStatus(status: string | null): MultiAgentRunStatus` (PD-6).
    - `groupFindings(findings: Array<MultiAgentFinding-without-group_id & { columnIndex: number }>): { groups: MultiAgentGroup[]; groupIdByFindingId: Map<string,string> }`: PD-2 sweep. Group `id` = id of the first finding in sorted order. Group `file` = the representative's original `file`. `title`/`severity` = representative (PD-5). `start_line` = `gs`, `end_line` = `ge`. `run_ids` deduped in column order. Groups sorted by normalized file asc, then `gs` asc.
    - `agentScope(name: string | null, description: string | null, categoriesInRun: FindingCategory[]): FindingCategory | null` (PD-3).
    - `buildLocations(columns: MultiAgentColumn[], groups: MultiAgentGroup[], scopeByRunId: Map<string, FindingCategory | null>): MultiAgentLocation[]`: PD-4/PD-5. Returns `[]` when fewer than `MIN_DONE_FOR_DISAGREEMENT` columns are `done`.
    - `summarizeTotals(columns): { total_duration_ms: number | null; total_cost_usd: number | null; cost_complete: boolean; in_flight: boolean }`: max of non-null `duration_ms`, sum of non-null `cost_usd` (null if none known), `cost_complete = columns.every(c => c.cost_usd != null)`, `in_flight` = any queued/running.
    - `findingRowToRecord(row: FindingRow): FindingRecord`: mirror `reviews/helpers.ts:34-53` field for field. Import `type { FindingRow }` via `./repository.js` re-export (the same trick as `reviews/helpers.ts:6`), **never** from `src/db/` directly, and never from `../reviews/` (`no-cross-module-reach`).
- **Skills to invoke:** `onion-architecture`, `typescript-expert`
- **Depends on:** Step 1
- **Done when:** the Step 10 unit tests pass. `pnpm arch` reports no new violation for `src/modules/multi-agent/helpers.ts`/`constants.ts`.

### Step 6 — `multi-agent` module: repository  ·  [backend]
- **Files:** `server/src/modules/multi-agent/repository.ts` (new)
- **Layer:** persistence
- **Interfaces:** `export class MultiAgentRepository { constructor(private db: Db) {} … }`, re-exporting `type { FindingRow }` from `../../db/rows.js` for helpers. Methods:
  - `getParent(workspaceId: string, id: string): Promise<{ id: string; prId: string; ranAt: Date; prNumber: number; prTitle: string; repoId: string } | undefined>`: `multi_agent_runs` inner join `pull_requests`, filtered by **both** `id` and `workspace_id` (cross-workspace returns undefined, then 404).
  - `latestParentId(workspaceId: string): Promise<string | null>`: order by `ran_at desc, id desc`, limit 1.
  - `runsForParent(parentId: string): Promise<Array<{ run: typeof t.agentRuns.$inferSelect; agentName: string | null; agentDescription: string | null }>>`: `agent_runs` left join `agents`, `where multi_agent_run_id = parentId`.
  - `reviewsWithFindingsForRuns(runIds: string[]): Promise<Array<{ review: typeof t.reviews.$inferSelect; findings: FindingRow[] }>>`: `reviews` where `run_id IN runIds AND kind = 'review'`, then findings `IN reviewIds`. Mirror `review.repo.ts:58-74`. Return `[]` for empty input without querying.
  - `estimatesForAgents(workspaceId: string, agentIds: string[]): Promise<Map<string, { n: number; meanDurationMs: number | null; meanCostUsd: number | null }>>`: a subquery over `agent_runs` (`workspace_id = $ws AND status = 'done' AND agent_id IN agentIds`) selecting `agent_id, duration_ms, cost_usd, row_number() over (partition by agent_id order by ran_at desc) as rn`. The outer query keeps `rn <= ESTIMATE_SAMPLE_SIZE`, `group by agent_id`, and selects `count(*)`, `avg(duration_ms)`, `avg(cost_usd)`. Convert postgres numeric strings with `Number(...)` and keep null as null. Use drizzle `sql\`\`` + `.as()` for the window column. Return an empty map for empty input.
- **Skills to invoke:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`
- **Depends on:** Steps 2, 5
- **Done when:** typecheck passes. The Step 10 it-test exercises every method, including the 10-run window (seed 12 done runs and assert the mean covers only the newest 10).

### Step 7 — `multi-agent` module: service + routes + registration  ·  [backend]
- **Files:** `server/src/modules/multi-agent/service.ts` (new) · `server/src/modules/multi-agent/routes.ts` (new) · `server/src/modules/index.ts` (edit: `import multiAgent from './multi-agent/routes.js';` + `multiAgent,` entry after `reviews`)
- **Layer:** application (service) · presentation (routes)
- **Interfaces:**
  - `export class MultiAgentService { constructor(private container: Container) { this.repo = new MultiAgentRepository(container.db); } }`:
    - `getRun(workspaceId, id): Promise<MultiAgentRunView>`. Load the parent (`NotFoundError('Multi-agent run not found')` if missing), its runs, and the reviews and findings for its runs. For each run, build a column: `score = run.score ?? review?.score ?? null`, `verdict`/`summary` from the review, `findings` mapped via `findingRowToRecord` with `run_id`/`agent_id`. Order columns per PD-8. Then run `groupFindings`, attach `group_id` to each finding, compute `agentScope` per column, `buildLocations` and `summarizeTotals`, and set `agent_count = columns.length`.
    - `latest(workspaceId): Promise<MultiAgentLatestResponse>`.
    - `estimates(workspaceId): Promise<AgentRunEstimate[]>`: `this.container.agentsRepo.listEnabled(workspaceId)` (cross-module data through the container, per `server/CLAUDE.md`), then `repo.estimatesForAgents`. Agents with no row get `{ sample_size: 0, mean_duration_ms: null, mean_cost_usd: null }`.
  - `routes.ts` (pattern: `eval/routes.ts:32-73`, `withTypeProvider<ZodTypeProvider>()`, `getContext`, response schemas):
    - `GET /multi-agent-runs/latest` returns `{200: MultiAgentLatestResponse}`. Register it **before** the `:id` route. The static path wins in find-my-way either way, but the order keeps it readable.
    - `GET /multi-agent-runs/:id` takes `params: IdParams` and returns `{200: MultiAgentRunView}`.
    - `GET /multi-agent/estimates` returns `{200: z.array(AgentRunEstimate)}`.

    All three are read-only, use the global rate limit, and have no per-route cap.
- **Skills to invoke:** `onion-architecture`, `fastify-best-practices`, `security`, `zod`, `typescript-expert`
- **Depends on:** Steps 4, 5, 6
- **Done when:** `pnpm typecheck && pnpm arch` pass. `curl localhost:3001/multi-agent-runs/latest` returns `{"id":null}` on a fresh DB. A response that fails the Zod response schema would 500, so the Step 10 it-test asserting `GET /multi-agent-runs/:id` returns 200 doubles as a serializer check.

### Step 8 — Server docs  ·  [backend]
- **Files:** `server/specs/api-contract.md` (edit) · `specs/review-flow.md` (edit)
- **Layer:** n/a
- **Interfaces:**
  - `api-contract.md:38`: extend the `POST /pulls/:id/review` row with the `{agentIds}` form, PD-1's 422/404 rules, and the `multi_agent_run_id` response field. Add rows for the three new GET routes.
  - `review-flow.md`: add one invariant under the R-list. "**R9** A review started with `agentIds` creates one `multi_agent_runs` parent and links every created `agent_runs` row to it in one transaction; `agentId`/`all` runs stay parentless. Grouping and conflicts are computed from persisted findings and never stored."
- **Skills to invoke:** none (docs)
- **Depends on:** Steps 4, 7
- **Done when:** both docs mention every new route and field this plan adds.

### Step 9 — Client data layer: hooks + formatting  ·  [frontend]
- **Files:** `client/src/lib/hooks/multi-agent.ts` (new) · `client/src/lib/hooks/index.ts` (edit: `export * from "./multi-agent";`) · `client/src/lib/format.ts` (edit)
- **Layer:** n/a (client data layer)
- **Interfaces** (`"use client"`; types only from `@devdigest/shared`; all network through `api` from `../api`):
  - `useAgentEstimates(enabled = true)` uses `queryKey ["multi-agent-estimates"]` and calls `GET /multi-agent/estimates`, with `staleTime: 60_000`.
  - `useStartMultiAgentReview()` is a mutation `({ prId, agentIds }: { prId: string; agentIds: string[] }) => api.post<ReviewStartResponse>(\`/pulls/${prId}/review\`, { agentIds })`. `onSuccess` invalidates `["reviews", prId]`, `["pr-runs", prId]`, `["pr-active-runs", prId]` and `["multi-agent-latest"]`. Errors, including 429 from the 10/min cap, are toasted by the global `MutationCache.onError` (`client/src/lib/providers.tsx:41-43`); do not add a second toast.
  - `useMultiAgentRun(id: string | null | undefined)` uses `queryKey ["multi-agent-run", id]` and calls `GET /multi-agent-runs/${id}`, with `refetchInterval: (q) => (q.state.data?.in_flight ? 4000 : false)` (server-sourced in-flight state, AC-35, mirroring `usePrRuns` at `reviews.ts:40-48`).
  - `useLatestMultiAgentRun()` uses `queryKey ["multi-agent-latest"]` and calls `GET /multi-agent-runs/latest`.
  - `useGroupFindingAction(parentId: string, prId: string)` is a mutation `({ findingIds, action }: { findingIds: string[]; action: "accept" | "dismiss" }) => Promise.all(findingIds.map(id => api.post(\`/findings/${id}/${action}\`)))` (D5/AC-30, using the existing endpoints). `onSuccess` invalidates `["multi-agent-run", parentId]`, `["reviews", prId]` and `["pulls"]`.
  - `format.ts`: add `export function formatDurationMs(ms: number | null | undefined): string`. It returns `"—"` for null, `"8.2s"` (1 decimal) below 60 s, and `"1m 05s"` from 60 s up. Cost keeps using `formatCostUsd` (one home).
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `security`, `typescript-expert`
- **Depends on:** Step 1
- **Done when:** `cd client && pnpm typecheck` passes. `formatDurationMs` is unit-tested in `client/src/lib/format.test.ts` (new): null gives "—", 8200 gives "8.2s", and 65000 gives "1m 05s".

### Step 10 — Server tests  ·  [backend]
- **Files:** `server/test/multi-agent-helpers.test.ts` (new, hermetic) · `server/test/multi-agent.it.test.ts` (new, DB-backed; **must** end in `.it.test.ts`)
- **Layer:** n/a
- **Interfaces / cases:**
  - Unit:
    - `groupFindings`: equal path after `a/`/`b/`/`./` normalization groups; non-overlapping ranges don't; severity, category and title don't affect grouping (D1); the A–B–C chain becomes 1 group (PD-2); results are identical under shuffled input; representative selection follows PD-5.
    - `buildLocations`: fewer than 2 done columns gives `[]`. A failed or cancelled column gets no take (AC-24a). Severity divergence is a conflict, and so is a did-not-flag take. All agents agreeing at the same severity gives `is_conflict: false`.
    - `agentScope`: keyword path, category-frequency fallback, null.
    - `summarizeTotals`: max/sum, `cost_complete` false when one cost is null.
    - `ReviewStartRequest.safeParse`: duplicates, empty, mixed and non-uuid all fail; a valid list passes; the legacy `{}`, `{all:true}` and `{agentId:'x'}` still pass.
  - Integration: copy the `appWith` pattern from `server/test/reviews.it.test.ts:122-140`, **including** `secrets: new MockSecretsProvider({})` (`server/INSIGHTS.md` 2026-09-28), and reuse `setupRepoAndPr`'s shape. Use `waitForPrRuns` from `server/test/helpers/runs.ts`. Cases:
    - every Step 4 "Done when" case;
    - `GET /multi-agent-runs/:id` after the runs settle: columns = N, the grouped finding has `group_id`, `locations` is populated when 2 agents both flag `src/config.ts:11` with different severities (two `MockLLMProvider` fixtures, or one fixture plus a severity override per agent);
    - a cross-workspace id returns 404;
    - `GET /multi-agent-runs/latest` returns the newest parent;
    - `GET /multi-agent/estimates` honours the 10-run window and null cost;
    - AC-16: a column whose agent's provider has no key shows `status:'failed'` with non-null `error`, while the other column is `done`.
- **Skills to invoke:** `typescript-expert`, `drizzle-orm-patterns`
- **Depends on:** Steps 4, 7
- **Done when:** `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` and `pnpm exec vitest run .it.test` are both green.

### Step 11 — Shared client selection/estimate logic  ·  [frontend]
- **Files:** `client/src/components/multi-agent/useAgentSelection.ts` (new) · `client/src/components/multi-agent/estimates.ts` (new) · `client/src/components/multi-agent/index.ts` (new barrel) · `client/src/components/multi-agent/estimates.test.ts` (new)
- **Layer:** n/a
- **Interfaces:**
  - `useAgentSelection(): { selected: string[]; isSelected(id): boolean; toggle(id): void; clear(): void; selectAll(ids: string[]): void; count: number }`. It holds local UI state in a `Set` and starts empty (D15: none pre-ticked). Selection order = toggle order.
  - `estimateFor(estimates: AgentRunEstimate[] | undefined, agentId: string): AgentRunEstimate | undefined`.
  - `footerEstimate(ticked: Array<AgentRunEstimate | undefined>): { durationMs: number | null; costUsd: number | null; durationIncomplete: boolean; costIncomplete: boolean }`. Duration = max of known `mean_duration_ms`; cost = sum of known `mean_cost_usd`. Each `*Incomplete` flag is true when any ticked agent's value is null or missing, and each value is null when nothing is known (AC-9/11, D16).
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`
- **Depends on:** Step 9
- **Done when:** `estimates.test.ts` passes, covering AC-9's worked example (8.2/7.4/6.9/7.1 s gives 8.2 s; 0.06+0.05+0.04+0.05 gives 0.20) and the unknown-cost case (`costIncomplete: true`, the sum excludes the unknown).

### Step 12 — PR-page agent picker (M1)  ·  [frontend]
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx` (rewrite body; keep the export name and props) · `…/RunReviewDropdown/constants.ts` (edit: `PICKER_WIDTH = 320`; keep `DROPDOWN_WIDTH` only if still referenced, otherwise remove it) · `…/RunReviewDropdown/styles.ts` (edit) · `…/RunReviewDropdown/RunReviewDropdown.test.tsx` (rewrite) · `client/messages/en/prReview.json` (edit: add keys under `runReview`)
- **Layer:** n/a
- **Interfaces:**
  - Props are unchanged (`prId, size, kind, warnMerged, onRunStart, onRunsStarted, onRunSettled`); `PrDetailHeader` needs no edit.
  - Render `Popover` (from `@devdigest/ui`) with `label={t("runReview.pickerLabel")}` and the existing `Button` trigger (same `title`/opacity merged styling as today).
  - The panel contains:
    - a header `t("runReview.pickTitle")` ("PICK AGENTS TO RUN");
    - when `warnMerged`, the existing `runReview.mergedWarning` line (D22, AC-5a; the run stays allowed);
    - one row per **enabled** agent (`useAgents().data.filter(a => a.enabled)`, D15): `Checkbox` with `label={agent.name}` (its `<label>` wrapper gives the accessible name), plus the estimated time, right-aligned, `formatDurationMs(estimate?.mean_duration_ms)` or `t("runReview.estimateUnavailable")` (AC-1, time only per D16);
    - a "Clear" link-styled `<button type="button">` calling `clear()` (AC-3);
    - the primary `Button`, `t("runReview.runMulti", { count })`, disabled when `count === 0 || start.isPending` (AC-2/4);
    - a "Configure agents…" link-styled button calling `router.push(\`/multi-agent/configure?pr=${prId}\`)` (AC-5).
  - Empty state (no enabled agents): `t("runReview.noAgents")` plus a button to `/agents`. This replaces the hard-coded "No agents yet — create one" literal at line 61.
  - On run: call `onRunStart?.()`, then `const res = await start.mutateAsync({ prId, agentIds: selected })`, then `onRunsStarted?.(res.runs.map(r => r.run_id))`, then `router.push(\`/multi-agent/${res.multi_agent_run_id}\`)` (AC-12). Wrap in try/finally with `onRunSettled?.()`. On error do not navigate; the global toast reports it.
  - Use `useAgentSelection`, `useAgentEstimates`, `useStartMultiAgentReview`. Remove the `useRunReview` usage from this file (the hook itself stays in `reviews.ts`).
  - New `prReview.runReview` keys: `pickerLabel` "Pick agents to run", `pickTitle` "PICK AGENTS TO RUN", `clear` "Clear", `runMulti` "Run multi-agent review ({count})", `estimateUnavailable` "n/a", `noAgents` "No agents yet — create one". `configureAgents` already exists ("Configure agents…"). Keep `runAll` and the other existing keys (unused keys are allowed).
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`, `typescript-expert`
- **Depends on:** Steps 9, 11
- **Done when:** the rewritten test passes. It mocks `@/lib/hooks/agents`, the multi-agent hooks and `next/navigation`, and uses `fireEvent` (there is no user-event dependency; `client/INSIGHTS.md` 2026-09-18). It asserts:
  - the trigger renders "Run Review";
  - opening shows only enabled agents, none checked (`aria-checked="false"`);
  - ticking 2 shows "Run multi-agent review (2)";
  - "Clear" brings the button back to "(0)" and disabled;
  - "Configure agents…" pushes `/multi-agent/configure?pr=pr1`;
  - run calls `mutateAsync` with `{prId:"pr1", agentIds:[…]}` and pushes `/multi-agent/<id>`;
  - `warnMerged` shows the warning and the button is still enabled once an agent is ticked.

### Step 13 — Sidebar entry + `/multi-agent` entry route (D7, AC-34)  ·  [frontend]
- **Files:** `client/src/vendor/ui/nav.ts` (edit: data only) · `client/src/app/multi-agent/page.tsx` (new) · `client/src/components/app-shell/helpers.test.ts` (edit)
- **Layer:** n/a
- **Interfaces:**
  - `nav.ts`: in the `WORKSPACE` group, directly after `pulls`, add `{ key: "multi-agent", label: "Multi-Agent Review", icon: "Users", href: "/multi-agent" }`. This is plain per-lesson registry data, following `client/INSIGHTS.md` 2026-09-22 and the `skills`/`eval` precedent. Touch nothing else under `src/vendor/ui/**`. The `nav.multi-agent` label already exists in `shell.json:26`.
  - `app/multi-agent/page.tsx` (`"use client"`) renders `AppShell` with crumb `[{ label: t("page.crumb") }]` (`runs` namespace) and a `Skeleton` while `useLatestMultiAgentRun()` loads. Then `router.replace(data.id ? \`/multi-agent/${data.id}\` : "/multi-agent/configure")` inside an effect. On error it shows `ErrorState` with retry.
  - `helpers.test.ts`: add a `describe("Multi-Agent nav entry (SPEC-05)")` that asserts the WORKSPACE group contains `{key:"multi-agent", href:"/multi-agent"}` and that `activeKeyFor` returns `"multi-agent"` for `/multi-agent`, `/multi-agent/configure` and `/multi-agent/<uuid>`.
- **Skills to invoke:** `next-best-practices`, `react-best-practices`, `react-testing-library`
- **Depends on:** Step 9
- **Done when:** the test passes, and the sidebar shows "Multi-Agent Review" and highlights it on every `/multi-agent…` path.

### Step 14 — Configure run screen (M2, M3; AC-6..12)  ·  [frontend]
- **Files:** `client/src/app/multi-agent/configure/page.tsx` (new) · `client/src/app/multi-agent/configure/_hooks/useConfigureRun.ts` (new) · `client/src/app/multi-agent/configure/_components/AgentSelectList/{AgentSelectList.tsx,index.ts,styles.ts,AgentSelectList.test.tsx}` (new) · `client/src/app/multi-agent/configure/_components/EstimateFooter/{EstimateFooter.tsx,index.ts,styles.ts}` (new) · `client/src/app/multi-agent/configure/styles.ts` (new) · `client/messages/en/runs.json` (edit)
- **Layer:** n/a
- **Interfaces:**
  - `page.tsx` is layout only. It wraps the content in `<React.Suspense>` because `useSearchParams` sits on a static route; otherwise `next build` fails the CSR bailout check. It renders `AppShell` with crumb `[{label: t("page.crumb"), href: "/multi-agent"}, {label: t("configure.title")}]`, the title `t("configure.title")` ("Configure run"), step 1 and step 2.
  - `useConfigureRun()` returns `{ prId, setPrId, pulls, pullsLoading, agents, estimates, selection, start, run }`.
    - `prId` comes from `?pr=` (`useSearchParams`); `setPrId` writes it with `router.replace`.
    - `pulls` come from `usePulls(useActiveRepo().repoId)`.
    - `agents` = enabled agents only.
    - `selection` = `useAgentSelection()`.
    - `run()` calls `start.mutateAsync({prId, agentIds: selection.selected})`, then `router.push(\`/multi-agent/${res.multi_agent_run_id}\`)` (AC-12).
  - Step 1 "Pull request" (`t("configure.step1")`): `SearchableSelect` with `options = pulls.map(p => ({ value: p.id, label: t("page.prItem", { number: p.number, title: p.title }) }))`, `value={prId ?? ""}`, `placeholder={t("page.selectPr")}`.
  - Step 2 "Agents to run" (`t("configure.step2")`):
    - while `!prId`, show the `t("configure.pickPrFirst")` placeholder ("Pick a pull request first") and render no list (AC-7);
    - when there are no enabled agents, show `EmptyState` with the existing `page.noAgents.*` and a CTA to `/agents`;
    - otherwise `AgentSelectList`.
  - `AgentSelectList` props: `{ agents: Agent[]; estimates: AgentRunEstimate[] | undefined; isSelected(id): boolean; onToggle(id): void; onSelectAll(): void }`. Each row has a `Checkbox` (label = name), a description line **only** when `agent.description.trim() !== ""` (D17), and the estimated time and estimated cost (`formatDurationMs` / `formatCostUsd`, with `t("configure.unavailable")` when null, AC-11). A "Select all" link-button (`t("configure.selectAll")`) sits in the header (AC-8).
  - `EstimateFooter` props: `{ count: number; estimate: ReturnType<typeof footerEstimate>; disabled: boolean; pending: boolean; onRun(): void }`. It shows `t("configure.fanOut")` ("parallel fan-out"), the time and the cost, each followed by `t("configure.incomplete")` when its flag is set (AC-9/11). It also holds the primary button `t("configure.runMulti", { count })`, disabled when `!prId || count === 0 || pending` (AC-7). Render the footer only while `count > 0` (AC-9 "WHILE agents are ticked"). Otherwise render just the disabled button.
  - New `runs.json` keys under `configure`: `title`, `step1` "Pull request", `step2` "Agents to run", `pickPrFirst`, `selectAll` "Select all", `fanOut` "parallel fan-out", `incomplete` "(incomplete)", `unavailable` "n/a", `runMulti` "Run multi-agent review ({count})".
- **Skills to invoke:** `next-best-practices`, `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`, `typescript-expert`
- **Depends on:** Steps 9, 11, 13
- **Done when:** `AgentSelectList.test.tsx` passes. It covers: no checkbox checked initially; "Select all" ticks all; the description is hidden for an empty description; "n/a" is shown for a null estimate. A page-level render test (in the same file, or `configure/page.test.tsx`) shows the placeholder and a disabled button without `?pr=`, and shows the list with `?pr=x` (mock `useSearchParams`).

### Step 15 — Results page shell: header, mode switch, URL state (AC-25, D8, D10, D21, AC-33, AC-35)  ·  [frontend]
- **Files:** `client/src/app/multi-agent/[runId]/page.tsx` (new) · `client/src/app/multi-agent/[runId]/_hooks/useMultiAgentResults.ts` (new) · `client/src/app/multi-agent/[runId]/_components/ResultsHeader/{ResultsHeader.tsx,index.ts,styles.ts}` (new) · `client/src/app/multi-agent/[runId]/_components/ModeSwitch/{ModeSwitch.tsx,index.ts,styles.ts}` (new) · `client/src/app/multi-agent/[runId]/styles.ts` (new) · `client/messages/en/runs.json` (edit)
- **Layer:** n/a
- **Interfaces:**
  - `useMultiAgentResults(runId)` returns:
    - `{ data, isLoading, isError, refetch }` from `useMultiAgentRun(runId)`;
    - `view: "columns" | "tabs"` (from `?view=`, default `"columns"`; any other value means columns);
    - `setView`;
    - `agentTab` (`?agent=<run_id>`, default the first column);
    - `setAgentTab`;
    - `traceRunId` (`?trace=`) and `setTrace`;
    - `onlyConflicts` (`?only=conflicts`) and `setOnlyConflicts`;
    - `groupAction` (= `useGroupFindingAction(runId, data?.pr_id)`);
    - `turnIntoEval` (= `useTurnIntoEvalCase()`);
    - `groupOf(findingId): MultiAgentGroup | undefined`.

    Write URL params with one `router.replace` the way `usePrDetail.ts:61-76` (`writeParams`) does.
  - `page.tsx` wraps the content in `Suspense`. It renders `AppShell` with crumb `[{label: t("page.crumb"), href: "/multi-agent"}, {label: \`#${data.pr_number}\`, mono: true}]`, then `ResultsHeader`, then `DisagreementBlock` (Step 17), then `ColumnsView` or `TabsView` (Step 16). It mounts `RunTraceDrawer` when `traceRunId` is set, with props `runId`, `prNumber`, `agentName` (column's), `findings` (column's findings) and `running={column.status === "running" || column.status === "queued"}`. The import is `RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer"` (PD-10). Show a `Skeleton` while loading. On a 404, show `ErrorState` (`t("results.notFound")`). On other errors, show `ErrorState` with retry.
  - `ResultsHeader` props: `{ view: MultiAgentRunView; mode; onModeChange; onConfigure(): void }`. It renders:
    - `#{pr_number} {pr_title}` (text, never HTML);
    - `t("results.selected", { count: agent_count })`, "N selected agents · parallel";
    - the neutral summary `t("results.meta", { count, duration: formatDurationMs(total_duration_ms), cost: formatCostUsd(total_cost_usd) })`, "{count} agents · parallel · {duration} · {cost}" (D8), plus ` t("results.costIncomplete")` when `!cost_complete` (AC-33);
    - a "Configure run" `Button` that pushes `/multi-agent/configure?pr=${pr_id}`;
    - the `ModeSwitch`.
  - `ModeSwitch` props: `{ value: "columns" | "tabs"; onChange }`. It is two native `<button type="button" aria-pressed={…}>` elements inside `role="group" aria-label={t("results.modeLabel")}`, labelled `t("page.view.columns")` / `t("page.view.tabs")` (existing keys), so it is keyboard operable.
  - New `runs.json` keys under `results`: `selected` "{count} selected agents · parallel", `meta` "{count} agents · parallel · {duration} · {cost}", `costIncomplete` "(cost incomplete)", `configureRun` "Configure run", `modeLabel` "Results layout", `notFound` "Multi-agent run not found".
- **Skills to invoke:** `next-best-practices`, `react-best-practices`, `react-frontend-best-practices`, `typescript-expert`
- **Depends on:** Steps 9, 13
- **Done when:** typecheck passes. Reloading `/multi-agent/<id>?view=tabs` keeps tabs mode, and an in-flight run keeps polling after the reload (AC-35).

### Step 16 — Columns mode + Tabs + detail mode (AC-20, 26–32)  ·  [frontend]
- **Files:** `client/src/app/multi-agent/[runId]/_components/ColumnsView/{ColumnsView.tsx,index.ts,styles.ts,ColumnsView.test.tsx}` · `…/_components/AgentColumn/{AgentColumn.tsx,index.ts,styles.ts,helpers.ts}` · `…/_components/ColumnLiveStatus/{ColumnLiveStatus.tsx,index.ts}` · `…/_components/ContributorsLine/{ContributorsLine.tsx,index.ts}` · `…/_components/TabsView/{TabsView.tsx,index.ts,styles.ts,TabsView.test.tsx}` · `…/_components/AgentSummaryCard/{AgentSummaryCard.tsx,index.ts,styles.ts}` (all new, under `client/src/app/multi-agent/[runId]/`) · `client/messages/en/runs.json` (edit)
- **Layer:** n/a
- **Interfaces:**
  - `ColumnsView` props: `{ view: MultiAgentRunView; groupOf; onOpenTrace(runId: string): void }`. It is a horizontally scrolling flex row of `AgentColumn`s. Columns scroll internally; there is no cap on finding count.
  - `AgentColumn` props: `{ column: MultiAgentColumn; groupOf; onOpenTrace }`.
    - Header: agent name (`column.agent_name ?? t("results.deletedAgent")`), `formatDurationMs(duration_ms)`, `formatCostUsd(cost_usd)`, and `CircularScore score={column.score}` when the score is non-null.
    - Body by status:
      - `queued`/`running`: `ColumnLiveStatus`.
      - `failed`: an error state with `t("results.status.failed")` and `column.error` as text (AC-16).
      - `cancelled`: `t("results.status.cancelled")`.
      - `done`: the list of finding items, or the existing `column.noFindings` string.
    - Finding item: `SeverityBadge severity compact` (text plus icon, not colour alone), title, and `file:line` (reuse `lineLabel` from `FindingCard/helpers` only if it is exported from that barrel; otherwise put a local `lineLabel` in `AgentColumn/helpers.ts`). Below the item, `ContributorsLine` lists the other contributors (AC-20).
    - Footer: a "View trace" link-button (existing `viewTrace` key) calling `onOpenTrace(column.run_id)`, and `t("column.findingsCount", { count })` (existing key).
  - `ColumnLiveStatus` props: `{ runId: string; parentId: string }`. It uses `useRunEvents([runId])` and shows the last event's `msg`, or `t("results.status.running")`/`t("results.status.queued")` before the first event. When `running` flips from true to false it calls `queryClient.invalidateQueries({ queryKey: ["multi-agent-run", parentId] })`. This is the live status from the event stream (AC-27), while the polling in Step 9 stays the authority (`client/CLAUDE.md` gotcha).
  - `ContributorsLine` props: `{ group: MultiAgentGroup | undefined; columns: MultiAgentColumn[]; excludeRunId?: string }`. It renders `t("results.alsoFlaggedBy", { names })` when other contributors exist, and nothing otherwise.
  - `TabsView` props: `{ view; agentTab; onAgentTab; groupOf; onOpenTrace; onGroupAction(findingIds: string[], action: "accept"|"dismiss"): void; onTurnIntoEval(findingId: string): void; pendingFindingIds: Set<string>; evalPendingId: string | null }`.
    - It uses the `Tabs` kit with `tabs = columns.map(c => ({ key: c.run_id, label: c.agent_name ?? …, count: c.score ?? undefined }))` (one tab per agent with its score, AC-28).
    - The selected column renders `AgentSummaryCard`, then one `FindingCard` per finding. `FindingCard` is imported from `@/app/repos/[repoId]/pulls/[number]/_components/FindingCard` and is not modified (PD-10). Pass it `f={finding}`, `onAction={(a) => onGroupAction(groupOf(finding.id)?.finding_ids ?? [finding.id], a as "accept"|"dismiss")}` (D5/AC-30), `onTurnIntoEval={() => onTurnIntoEval(finding.id)}` (AC-31), `pending`, `evalPending`. Do **not** pass `repoFullName`/`headSha` (not in the view). Put `ContributorsLine` above each card.
    - `FindingCard` already hides Learn and Reply (D4) and shows the suggestion only when it is non-null (D12).
    - Failed, cancelled and running tabs show the same status states as `AgentColumn`.
  - `AgentSummaryCard` props: `{ column; onOpenTrace }`. It shows the score (`CircularScore`), the summary as `Markdown` from `@devdigest/ui` (the same safety as the existing findings UI; LLM output, never raw HTML) or the existing `tabs.noSummary`, plus "View trace", time and cost.
  - New `runs.json` keys under `results`:
    - `deletedAgent` "Deleted agent"
    - `alsoFlaggedBy` "Also flagged by {names}"
    - `status.queued` "Queued"
    - `status.running` "Running…"
    - `status.failed` "Failed"
    - `status.cancelled` "Cancelled"
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`, `security`, `typescript-expert`
- **Depends on:** Step 15
- **Done when:** the tests pass. Mock `useRunEvents` as `RunStatus.test.tsx:7` does, and drive with `fireEvent`.
  - `ColumnsView.test.tsx`: one column per agent; a failed column shows its error text; a running column shows the live status; "View trace" calls `onOpenTrace(run_id)`; "N findings" is shown.
  - `TabsView.test.tsx`: one tab per agent; expanding a finding shows the rationale and the Accept/Dismiss/Turn-into-eval buttons, and **no** "Learn" or "Reply"; Accept on a grouped finding calls `onGroupAction` with **all** of the group's finding ids; the confidence renders as `NN% conf`.

### Step 17 — "Where agents disagree" block (AC-21–24, D19, PD-4)  ·  [frontend]
- **Files:** `client/src/app/multi-agent/[runId]/_components/DisagreementBlock/{DisagreementBlock.tsx,index.ts,styles.ts,helpers.ts,DisagreementBlock.test.tsx}` (new) · `client/messages/en/runs.json` (edit)
- **Layer:** n/a
- **Interfaces:**
  - Props: `{ locations: MultiAgentLocation[]; onlyConflicts: boolean; onOnlyConflictsChange(v: boolean): void }`.
  - When `locations.length === 0`, return `null` (hidden).
  - `helpers.ts`: `visibleLocations(locations, onlyConflicts)`.
  - Header: the existing `conflicts.title`, plus `<label>` wrapping the text `conflicts.onlyConflicts` and `Toggle on={onlyConflicts}`. The label gives the `role="switch"` button its accessible name.
  - When the filtered list is empty, show the existing `conflicts.empty`.
  - Each row shows `file:line` (mono text), the title (text), and the takes. A flagged take is the agent name plus a `SeverityBadge`. A `did_not_flag` take is the agent name, the existing `conflicts.didNotFlag`, and the reason line `t(\`conflicts.reason.${take.scope ?? "general"}\`)` (D3/AC-24).
  - New `runs.json` keys under `conflicts.reason`:
    - `security` "Not a security concern."
    - `perf` "Not a performance concern."
    - `test` "Not a test-quality concern."
    - `style` "Not a style concern."
    - `bug` "Not a correctness concern."
    - `general` "Outside this agent's focus."
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`
- **Depends on:** Step 15
- **Done when:** `DisagreementBlock.test.tsx` passes. It asserts:
  - hidden for `[]`;
  - with the toggle OFF, both a conflict and an agreement are listed;
  - with the toggle ON, only the conflict is listed;
  - with the toggle ON and zero conflicts, the `conflicts.empty` text shows and the toggle is still present;
  - the did-not-flag reason uses the scope sentence;
  - the toggle is reachable as `getByRole("switch", { name: "Show only conflicts" })`.

### Step 18 — Client docs  ·  [frontend]
- **Files:** `client/specs/ui-flows.md` (edit)
- **Layer:** n/a
- **Interfaces:** add routes `/multi-agent` (redirects to latest or configure), `/multi-agent/configure?pr=`, and `/multi-agent/[runId]?view=&agent=&trace=&only=`. Document that the PR-page "Run Review" trigger now opens the agent picker.
- **Skills to invoke:** none (docs)
- **Depends on:** Steps 12–17
- **Done when:** every new route and query param is listed.

## Contract changes
- **New** `contracts/multi-agent.ts` in **both** `server/src/vendor/shared/contracts/` and `client/src/vendor/shared/contracts/`, byte-identical and CRLF-normalized (Step 1).
- **Edited** `index.ts` barrel in **both** copies: one added `export * from './contracts/multi-agent.js';` line plus a header-comment line.
- `observability.ts`, `platform.ts` (`RunRequest`) and `review-api.ts` (`ReviewRunResponse`) are **not edited**; the new file extends them.

## Database
- `agent_runs.multi_agent_run_id uuid NULL REFERENCES multi_agent_runs(id) ON DELETE SET NULL` + index `agent_runs_multi_agent_run_id_idx` (Step 2).
- Generate it with `cd server && pnpm db:generate` and apply it with `pnpm db:migrate`. Existing migrations and `meta/_journal.json` entries are append-only and are not edited.
- `multi_agent_runs` is reused as-is.

## Verification
1. `cd server && pnpm typecheck && pnpm arch && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test`. `pnpm arch` must report no **new** violation; the baseline file is not regenerated.
2. `cd client && pnpm typecheck && pnpm lint && pnpm test && pnpm build`. The build catches the Suspense-around-`useSearchParams` requirement on `/multi-agent` and `/multi-agent/configure`.
3. Contract parity: `git diff --no-index server/src/vendor/shared/contracts/multi-agent.ts client/src/vendor/shared/contracts/multi-agent.ts` prints nothing.
4. Migration hygiene: `git diff --stat -- server/src/db/migrations` shows only one new `.sql`, one new snapshot and an appended `_journal.json` entry.
5. API end-to-end (`./scripts/dev.sh`, then `cd server && pnpm db:migrate`; take a real imported PR id `$PR` and two enabled agent ids `$A`, `$B`; with zero API keys the runs fail, which still exercises AC-16):
   - `curl -s -XPOST localhost:3001/pulls/$PR/review -H 'content-type: application/json' -d "{\"agentIds\":[\"$A\",\"$B\"]}"` returns 200 with `multi_agent_run_id` and 2 `runs`.
   - `curl -s localhost:3001/multi-agent-runs/<id>` returns 2 `columns`, each eventually `done`, or `failed` with `error` text, with totals and `cost_complete`.
   - `curl -s localhost:3001/multi-agent-runs/latest` returns that id.
   - `curl -s localhost:3001/multi-agent/estimates` returns one entry per enabled agent.
   - `-d "{\"agentIds\":[\"$A\",\"$A\"]}"` returns 422; `-d '{"agentIds":[]}'` returns 422; a random uuid returns 404. After each, `select count(*) from multi_agent_runs` is unchanged.
   - `-d '{"all":true}'` returns no `multi_agent_run_id`, and `select count(*) from agent_runs where multi_agent_run_id is not null` is unchanged.
6. UI end-to-end, by a human at `localhost:3000`, ideally with a provider key set so the runs complete:
   - Open a PR and click **Run Review**. The "PICK AGENTS TO RUN" panel lists only enabled agents with a time each. Tick 2; the button reads "(2)". Click **Clear**; the button is disabled. Tick 2 again and run. The browser lands on `/multi-agent/<id>` in Columns mode with live column status.
   - Reload mid-run; the state persists.
   - When the runs finish, check the scores, findings and "N findings". Click **View trace**; the existing drawer opens with its Live log.
   - Switch to **Tabs**; the URL gets `?view=tabs`. Expand a finding and check the confidence %, the rationale, and the suggested fix only when present. Accept a finding that another agent also flagged; both agents' findings show Accepted.
   - Click **Turn into eval case**; a case is created (201).
   - Check the "Where agents disagree" toggle behaviour.
   - Click the **Multi-Agent Review** sidebar entry; it opens the latest run. On a DB with no parent run it opens Configure run, which shows "Pick a pull request first" with a disabled button. Pick a PR, tick agents, and check that the footer shows max time, summed cost and "parallel fan-out".

## Risks / open questions
- **R1 (Steps 4, 15, 14; high visibility): execution is sequential.** `ReviewRunExecutor.executeRuns` awaits agents one by one (`run-executor.ts:124-151`), but AC-12, D8, D10 and the M3 footer present the review as parallel, with wall-clock time = max. Under the spec's own "no new parallel-execution mechanism" non-goal, this plan does not change the executor. As a result, real wall-clock time ≈ the **sum** of durations, the "parallel" label and the max-based estimate overstate the speed, and not-yet-started agents show "running" (PD-6). Making `executeRuns` concurrent would be a small change: `Promise.allSettled` over `jobs`, ideally only when the request came with `agentIds` so `all`/`agentId` behaviour stays unchanged (AC-17). The user should confirm whether that counts as "a new mechanism" before or after implementation. It is **not** planned here.
- **R2 (Step 12): legacy menu removal.** PD-9 removes "Run all enabled agents" and single-agent items from the PR page UI. If M1 actually shows them alongside the picker, re-add them above the picker. The API forms still work.
- **R3 (Step 17): toggle default.** PD-4 defaults "Show only conflicts" to OFF. Compare with M4/M5 and flip the default if the mockup shows it ON (a one-line change in `useMultiAgentResults`).
- **R4 (Step 7): estimate query cost.** The window function scans all `done` runs of the enabled agents in the workspace. That is fine for a local single-user DB. An `(agent_id, status, ran_at)` index was deliberately **not** added, to keep the migration minimal.
- **R5 (Steps 15–16): cross-route imports** of `FindingCard`/`RunTraceDrawer` from the PR route (PD-10). Relocating both to `src/components/` would be cleaner but is an adjacent refactor and is not planned.
- **R6 (Step 16): Turn into eval case** returns 409 for undecided findings and for findings whose review has no agent (seeded PR #482, `server/INSIGHTS.md` 2026-10-11). `FindingCard` already disables the button until the finding is decided, and the 409 surfaces through the global mutation toast.
- **R7 (verification): seed data has no `agent_runs`** (`server/INSIGHTS.md` 2026-09-18), so the demo DB alone shows nothing on these pages. Verify against a real import or the it-tests.
- **R8 (Step 4): hermeticity.** Every new it-test must inject `MockSecretsProvider({})`, or intent classification can make real billed OpenRouter calls (`server/INSIGHTS.md` 2026-09-28).
- **R9 (Step 1): CRLF.** New vendored files must be CRLF-normalized, or the parity diff fails (`INSIGHTS.md` 2026-10-05).
- **Adjacent, not planned:** `RunReviewDropdown` is now a popover and the name is stale (rename later). `observability.ts`'s `MultiAgentRun`/`AgentColumn`/`Conflict` are now superseded by `multi-agent.ts` (leave them as scaffolding). `runs.page.meta`'s "fan-out via p-queue" copy is stale (unused, kept). Moving `useRunReview`'s callers to a typed `ReviewStartResponse` is not planned. The skill map in `pr-self-review` is complete for the skills this plan uses (17 folders on disk; the unmapped ones are workflow-only).

## Do-not-touch confirmations
- `server/src/db/migrations/**`: only a new file generated by `pnpm db:generate`. No existing `.sql` or `_journal.json` entry is edited (Step 2, Verification 4).
- `client/src/vendor/ui/**`: the only edit is one data entry in `nav.ts`'s `NAV` registry, following the documented precedent (`client/INSIGHTS.md` 2026-09-22). Every component is imported through the `@devdigest/ui` barrel, and no layer file is edited.
- `server/src/vendor/shared/**` and `client/src/vendor/shared/**`: only additive. One new file per copy (identical) plus one barrel line per copy. `observability.ts` is untouched (D14).
- `reviewer-core/**`: unchanged. The server imports `normalizeEvalPath`/`rangesOverlap` from its existing exports.
- `ci/`, `agent-runner/`: not present and not created.
- `server/clones/**`, `client/.next/**`, `**/test-results/**`: no writes.
- `skills-lock.json`: untouched.
- Lesson scaffolding: `multi_agent_runs`, the `runs` i18n namespace and the `shell.nav["multi-agent"]` label are **consumed**, not deleted or duplicated. Unused scaffold keys stay.
