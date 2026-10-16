# Plan — Export to CI (agent manifest + GitHub Actions runner + CI Runs)
**Spec:** `specs/SPEC-05-export-to-ci.md` (verified in Step 0: no `[NEEDS CLARIFICATION]` markers, "Open questions: none"; three small spec-internal conflicts are resolved below as defaults and listed under Risks / open questions)
**Request:** Write the implementation plan for SPEC-05. User constraints: simplest implementation, skip complex features, scope fence = the `ci/` module, its routes, the CI Runs page and the agent's CI tab; do not touch the multi-run service or the PR feed.
**Status:** READY FOR IMPLEMENTER
**Packages touched:** server · client · shared (×2) · **new** `agent-runner/` package · (read-only consumers: reviewer-core)
**Out of scope:** CircleCI/Jenkins/CLI generators (cards render disabled only) · publishing `devdigest/review-action@v1` · GitHub App · any inbound ingest endpoint · real-time delivery · uninstall/cleanup · non-OpenRouter providers · real memory in `memory.jsonl` · `pull_request_target`/fork reviews · renaming files after an agent/skill rename · PAT-scope diagnostics · the `ci_runs` table (left unused, not deleted) · `CiExportInput`/`CiRun` contracts (left as unused scaffolding, not deleted) · prefilling the wizard with the previous install's triggers/post-as · e2e flows · the multi-run service, `modules/pulls/**`, `modules/reviews/**`, the PR feed · a Stats tab.
**Sources read:** `specs/SPEC-05-export-to-ci.md`, `CLAUDE.md`, `INSIGHTS.md`, `server/CLAUDE.md`, `server/INSIGHTS.md`, `client/CLAUDE.md`, `client/INSIGHTS.md`, `reviewer-core/CLAUDE.md`, `specs/review-flow.md` (R2, R6), `TESTING.md`, `.gitignore`, `server/package.json`, `server/tsconfig.json`, `server/.dependency-cruiser.cjs`, `server/src/vendor/shared/{index.ts,adapters.ts,contracts/eval-ci.ts,contracts/trace.ts,contracts/knowledge.ts}`, `client/src/vendor/shared/{index.ts,contracts/eval-ci.ts,contracts/trace.ts}`, `server/src/db/schema/{ci.ts,runs.ts,agents.ts,skills.ts,repos.ts}`, `server/src/db/schema.ts`, `server/src/modules/index.ts`, `server/src/modules/eval/{routes.ts,constants.ts}`, `server/src/modules/agents/{routes.ts,repository.ts}`, `server/src/modules/_shared/schemas.ts`, `server/src/platform/{container.ts,errors.ts}`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`, `server/src/adapters/git/diff-parser.ts`, `server/test/eval-routes.test.ts`, `reviewer-core/{package.json,src/index.ts,src/review/run.ts,src/output/to-review.ts}`, `client/package.json`, `client/messages/en/{ci.json,agents.json}`, `client/src/i18n/request.ts`, `client/src/vendor/ui/{nav.ts,kit/Modal.tsx}`, `client/src/components/app-shell/helpers.ts`, `client/src/lib/{repo-context.tsx,api.ts}`, `client/src/lib/hooks/{index.ts,eval.ts,agents.ts}`, `client/src/app/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,constants.ts}`, `client/src/app/agents/[id]/_hooks/useAgentTab.ts`, `client/src/app/eval/page.tsx`, `.claude/skills/*/SKILL.md` (inventory).

## Context

**What exists and gets consumed (do not recreate):**
- `server/src/vendor/shared/contracts/eval-ci.ts:133-239` — `CiTarget`, `CiFile`, `AgentManifest` (server only), `CiExportInput`, `CiInstallation`, `CiExport`, `CiRunStatus`, `CiRun`, `CiResultArtifact`. The doc comment names `POST /agents/:id/export-ci` and `CiService.agentYaml` — this plan uses exactly those names. The client copy (`client/src/vendor/shared/contracts/eval-ci.ts`) lacks `AgentManifest` and does not import `Provider`/`CiFailOn` (line 3).
- `server/src/vendor/shared/contracts/trace.ts:76-92` — `RunTrace.config.source` already `local|ci`.
- `server/src/db/schema/ci.ts` — `ci_installations` (id, agent_id FK cascade, repo, target_type, installed_at) — gets columns added. `ci_runs` stays unused (decision 5).
- `server/src/db/schema/runs.ts:8-33` — `agent_runs` with `source local|ci`, `status`, `duration_ms`, `cost_usd`, `findings_count`, `blockers`, `score`; `agent_id`/`pr_id` nullable (set null on delete). Gets CI columns added.
- `server/src/db/schema/repos.ts:15` — `repos.default_branch` already stored → base branch comes from the row, no GitHub call.
- `server/src/vendor/shared/adapters.ts:149-173` — `GitHubClient` already has `commitFiles` (create-or-update branch, one commit), `findOpenPr`, `openPullRequest`. Implemented in `server/src/adapters/github/octokit.ts:245-349`, mocked in `server/src/adapters/mocks.ts:141-251`.
- `server/src/adapters/git/diff-parser.ts:14` — pure `parseUnifiedDiff(raw)` (type-only imports) — the runner reuses it.
- `reviewer-core/src/index.ts` — `reviewPullRequest`, `toReviewPayload`, `gateTriggered`, `countBlockers`, `OpenRouterProvider` (comment in `container.ts:253` says it is "shared with the CI runner"). Its header comment anticipates a bundled runner.
- `.gitignore:3-6` — already un-ignores `agent-runner/dist/` "MUST be committed". This plan creates the top-level `agent-runner/` package that line anticipates.
- `server/src/modules/agents/helpers.ts:82` — a `ci_fail_on` change counts as a config change and bumps `agents.version` → "out of date" = `installation.workflow_version < agent.version`. Existing `PUT /agents/:id` already accepts `ci_fail_on` (`agents/routes.ts:54`), and client `useUpdateAgent` (`client/src/lib/hooks/agents.ts:61`) already calls it.
- `container.agentsRepo.linkedSkills(agentId)` (`agents/repository.ts:192`) — ordered linked skills with `skill.enabled`, `skill.name`, `skill.body`.
- `container.secrets.get('OPENROUTER_API_KEY')` — local key presence for the AC-13 badge.
- Client: `client/messages/en/ci.json` (`runs`, `exportWizard`, `ciTab`, `publishDialog`, `page.crumb`), `client/messages/en/agents.json:52` already has `editor.tabs.ci`, `client/src/components/app-shell/helpers.ts:38` already maps `/ci-runs` → nav key `"ci-runs"`, namespaces auto-load (`client/src/i18n/request.ts`). `client/INSIGHTS.md` (2026-09-22) confirms `src/vendor/ui/nav.ts` is per-lesson data meant to be extended.

**What is missing:** no `server/src/modules/ci/`; no registry entry; no runner; no GitHub artifact/content methods; no CI tab, wizard, CI Runs page, or `ci` hooks.

**Invariant that shapes storage:** `specs/review-flow.md` R2 — `agent_runs.status ∈ running · done · failed · cancelled`. CI rows therefore store `done`/`failed`; the CI verdict (`succeeded` / `no_findings` / `failed`) is **derived** (done + findings_count = 0 → `no_findings`, done + > 0 → `succeeded`, failed → `failed`). Ingested rows are never `running`, so the boot reaper (R6) never touches them. CI rows keep `pr_id = null`, so the PR feed and the PR run timeline (`reviews/repository/run.repo.ts`, filtered by `pr_id`) never see them.

## Decisions taken by this plan (expensive to reverse)
1. **Runner = new top-level `agent-runner/` package** (TypeScript source, esbuild-bundled to ONE committed CommonJS file `agent-runner/dist/agent-runner.cjs`). CJS, not ESM, because the bundled `openai` SDK's CJS deps use dynamic `require` of node builtins, which esbuild's ESM output rejects at runtime. The studio copies that file verbatim into the target repo at `.devdigest/runner/agent-runner.cjs`.
2. **Result channel:** the workflow uploads `devdigest-result.json` as artifact `devdigest-result-<agentSlug>-<run_id>-<run_attempt>`; the studio lists artifacts by that prefix, downloads, unzips (`fflate`), validates with the shared `CiRunResult` schema, and inserts `agent_runs` + `run_traces` inside one transaction with `ON CONFLICT (ci_run_key) DO NOTHING`.
3. **Sync is an explicit `POST /ci/sync`** called by the client on page/tab mount and on Refresh; `GET` routes stay pure (no GitHub calls on window-focus refetch). Sync never throws for GitHub failures — it returns `error` (AC-29).
4. **New contracts go in a NEW file** `contracts/ci-export.ts` (both copies). Existing files get only additive edits: `AgentManifest` gains `version` (and the client copy gains the whole `AgentManifest` block), `RunTrace.config` gains three optional fields.
5. **Repo is addressed by `repo_id`** (uuid of the workspace `repos` row), never a client-supplied `owner/name`. `owner`/`name` from the row are still validated with a strict regex before any GitHub call or generated file.
6. **The zip option also persists the installation** (`action: 'files'`, no GitHub call) — otherwise runs from a zip-installed workflow could never be ingested (sync iterates installations).
7. **Agent slug is frozen on the installation** (`ci_installations.agent_slug`): updates reuse it, so artifact matching and file paths stay stable.

## Steps

### Step 1 — Shared contracts (both vendored copies)  ·  [full-stack]
- **Files:**
  - `server/src/vendor/shared/contracts/ci-export.ts` (new) and `client/src/vendor/shared/contracts/ci-export.ts` (new, byte-identical, **CRLF line endings** — root INSIGHTS 2026-10-05).
  - `server/src/vendor/shared/contracts/eval-ci.ts` (edit) — add one field to `AgentManifest`: `version: z.number().int().positive().nullish(),` (after `ci_fail_on`; comment: "agent version at export time — the manifest version recorded in the CI trace").
  - `client/src/vendor/shared/contracts/eval-ci.ts` (edit) — change line 3 import to `import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';` and insert the complete `AgentManifest` + `AgentManifestInput` block (identical to the server's, including the new `version` field) between `CiFile` and `CiExportInput`, mirroring the server's position.
  - `server/src/vendor/shared/contracts/trace.ts` and `client/src/vendor/shared/contracts/trace.ts` (edit, identical change) — add above `RunTrace`:
    ```ts
    /** CI provenance: what a CI run depended on (SPEC-05 decision 13). */
    export const RunDependencies = z.object({
      skills: z.array(z.object({ slug: z.string(), sha256: z.string() })),
      runner_version: z.string(),
      reviewer_core_version: z.string(),
    });
    export type RunDependencies = z.infer<typeof RunDependencies>;
    ```
    and inside `RunTrace.config` after `source`: `manifest_version: z.number().int().nullish(), commit_sha: z.string().nullish(), dependencies: RunDependencies.nullish(),`.
  - `server/src/vendor/shared/index.ts` and `client/src/vendor/shared/index.ts` (edit) — add `export * from './contracts/ci-export.js';` directly after the `eval-ci.js` line.
- **Layer:** n/a (contracts)
- **Interfaces** — `ci-export.ts` imports `z`, `{ CiTarget, CiInstallation, CiExportInput, CiResultArtifact }` from `./eval-ci.js`, `{ CiFailOn }` from `./knowledge.js`, `{ RunDependencies }` from `./trace.js`; exports (schema + `z.infer` type for each):
  - `CI_REPO_FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/` and `CI_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/` (exported consts).
  - `CiTrigger = z.enum(['opened', 'synchronize', 'reopened'])`.
  - `CiPostAs = CiExportInput.shape.post_as` (reuse — `github_review | pr_comment | none`).
  - `CiPreviewInput = z.object({ repo_id: z.string().uuid(), target: CiTarget.default('gha'), post_as: CiPostAs.default('github_review'), triggers: z.array(CiTrigger).min(1).default(['opened','synchronize']) })` + `type CiPreviewInputBody = z.input<typeof CiPreviewInput>`.
  - `CiPreviewFile = z.object({ path: z.string(), contents: z.string(), editable: z.boolean(), exists: z.boolean() })`.
  - `CiPreview = z.object({ repo: z.string(), base_branch: z.string(), agent_slug: z.string(), files: z.array(CiPreviewFile), openrouter_key_ready: z.boolean(), existing_installation_id: z.string().nullable() })`.
  - `CiInstallInput = CiPreviewInput.extend({ action: CiExportInput.shape.action /* 'open_pr' | 'files' */, workflow: z.string().min(1).max(100_000).optional() })` + `CiInstallInputBody`.
  - `CiVerdict = z.enum(['succeeded', 'failed', 'no_findings'])` (subset of `CiRunStatus`; ingested runs are never `running`).
  - `CiLatestRun = z.object({ status: CiVerdict, ran_at: z.string(), blocking: z.boolean() })`.
  - `CiInstallationView = CiInstallation.extend({ agent_slug: z.string().nullable(), workflow_version: z.number().int().nullable(), out_of_date: z.boolean(), pr_url: z.string().nullable(), latest_run: CiLatestRun.nullable() })`.
  - `CiRunRow = z.object({ id: z.string(), ran_at: z.string(), repo: z.string().nullable(), pr_number: z.number().int().nullable(), agent_id: z.string().nullable(), agent_name: z.string().nullable(), status: CiVerdict, blocking: z.boolean(), findings_count: z.number().int().nullable(), cost_usd: z.number().nullable(), duration_ms: z.number().int().nullable(), job_url: z.string().nullable() })`.
  - `AgentCiOverview = z.object({ agent_id: z.string(), agent_version: z.number().int(), ci_fail_on: CiFailOn, installations: z.array(CiInstallationView), runs: z.array(CiRunRow) })`.
  - `CiSyncInput = z.object({ agent_id: z.string().uuid().optional() })`; `CiSyncResult = z.object({ ingested: z.number().int(), skipped: z.number().int(), error: z.string().nullable() })`.
  - `CiRunResult = CiResultArtifact.extend({ status: CiVerdict, blockers: z.number().int().nonnegative(), error: z.string().max(2000).nullish(), agent_slug: z.string().regex(CI_SLUG_RE), repository: z.string().regex(CI_REPO_FULL_NAME_RE), job_url: z.string().url().refine((u) => u.startsWith('https://github.com/'), 'job_url must be a github.com URL'), github_run_id: z.number().int().positive(), github_run_attempt: z.number().int().positive(), model: z.string().min(1), manifest_version: z.number().int().nullable(), commit_sha: z.string().regex(/^[0-9a-f]{40}$/).nullable(), dependencies: RunDependencies, finished_at: z.string().datetime(), tokens_in: z.number().int().nullish(), tokens_out: z.number().int().nullish() })` — the `devdigest-result.json` shape (AC-24).
- **Skills to invoke:** `zod`, `typescript-expert`
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` and `cd client && pnpm typecheck` pass; the two `ci-export.ts` files are byte-identical (`git diff --no-index server/src/vendor/shared/contracts/ci-export.ts client/src/vendor/shared/contracts/ci-export.ts` prints nothing); the `AgentManifest` block and the `RunTrace` edit read identically in both copies.

### Step 2 — Database: CI columns + migration  ·  [backend]
- **Files:** `server/src/db/schema/ci.ts` (edit), `server/src/db/schema/runs.ts` (edit), `server/src/db/migrations/0016_*.sql` + `meta/*` (generated, new).
- **Layer:** infrastructure (persistence)
- **Interfaces:**
  - `ci_installations` add: `agentSlug: text('agent_slug')` (nullable), `workflowVersion: integer('workflow_version')` (nullable), `prUrl: text('pr_url')` (nullable), `updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()`; table extra config `(t) => ({ uq: uniqueIndex('ci_installations_agent_repo_target_uq').on(t.agentId, t.repo, t.targetType) })`.
  - `agent_runs` add (all nullable): `ciRepo: text('ci_repo')`, `ciPrNumber: integer('ci_pr_number')`, `ciJobUrl: text('ci_job_url')`, `ciRunKey: text('ci_run_key')`; extra config `(t) => ({ ciRunKeyUq: uniqueIndex('agent_runs_ci_run_key_uq').on(t.ciRunKey), sourceIdx: index('agent_runs_source_ran_at_idx').on(t.source, t.ranAt) })`. Postgres unique indexes allow many NULLs, so local runs are unaffected. Do **not** add a FK to `ci_installations` (keeps `runs.ts` free of a new import; repo+agent identify the installation).
  - `ci_run_key` format: `` `${github_run_id}-${github_run_attempt}` `` (decision 18).
  - Generate with `cd server && pnpm db:generate` — adds only, so it is non-interactive (server INSIGHTS 2026-09-23 warns only about drop+add in one diff). Never hand-write or edit an existing migration.
- **Skills to invoke:** `drizzle-orm-patterns`, `postgresql-table-design`
- **Depends on:** nothing
- **Done when:** exactly one new migration (`0016_*.sql`) plus journal/snapshot entries appear, containing only `ALTER TABLE ... ADD COLUMN` and `CREATE UNIQUE INDEX`/`CREATE INDEX` statements; `pnpm db:migrate` applies cleanly on a dev DB; `pnpm typecheck` passes.

### Step 3 — GitHub port: artifacts + existing paths  ·  [backend]
- **Files:** `server/src/vendor/shared/adapters.ts` (edit — **server copy only**; the client copy's `GitHubClient` already lacks `commitFiles`/`findOpenPr` and the client never uses this interface — note the drift, do not mirror), `server/src/adapters/github/octokit.ts` (edit), `server/src/adapters/mocks.ts` (edit), `server/package.json` (edit: add `"fflate": "^0.8.2"` and `"yaml": "^2.6.1"` to `dependencies`; run `pnpm install` to update `server/pnpm-lock.yaml`; delete any stray `pnpm-workspace.yaml` pnpm writes — root INSIGHTS 2026-10-04).
- **Layer:** ports + infrastructure
- **Interfaces** (add to `adapters.ts` next to `GitHubClient`):
  ```ts
  export interface WorkflowArtifact { id: number; name: string; expired: boolean; createdAt: string | null; }
  // in GitHubClient:
  /** Non-expired artifacts whose name starts with `namePrefix`, newest first (first page, ≤100). */
  listArtifacts(repo: RepoRef, namePrefix: string): Promise<WorkflowArtifact[]>;
  /** Download an artifact zip and return one file's UTF-8 text, or null if absent / larger than maxBytes. */
  readArtifactFile(repo: RepoRef, artifactId: number, fileName: string, maxBytes: number): Promise<string | null>;
  /** Best-effort: which of `paths` exist at `ref` (404 → absent). */
  existingPaths(repo: RepoRef, ref: string, paths: string[]): Promise<string[]>;
  ```
  - Octokit impl (same `withRetry(withTimeout(...))` shape as neighbours): `octokit.rest.actions.listArtifactsForRepo({ owner, repo, per_page: 100 })` → filter `name.startsWith(prefix) && !expired`, map `created_at`; `octokit.rest.actions.downloadArtifact({ owner, repo, artifact_id, archive_format: 'zip' })` → `unzipSync(new Uint8Array(res.data as ArrayBuffer), { filter: (f) => f.name === fileName && f.originalSize <= maxBytes })` → `strFromU8(...)` or null; `octokit.rest.repos.getContent({ owner, repo, path, ref })` per path via `Promise.allSettled`, keep fulfilled ones.
  - `MockGitHubOptions` gains `artifacts?: { id: number; name: string; expired?: boolean; createdAt?: string; files: Record<string, string> }[]` and `existingPaths?: string[]`; `MockGitHubClient` implements the three methods from those options (prefix filter, `files[fileName] ?? null`, intersection).
- **Skills to invoke:** `onion-architecture`, `security`, `typescript-expert`
- **Depends on:** nothing
- **Done when:** `pnpm typecheck` passes (both `implements GitHubClient` classes compile); `pnpm arch` reports no new violation.

### Step 4 — Agent-runner package (bundled CI runner)  ·  [backend]
- **Files (all new):**
  - `agent-runner/package.json` — `"name": "@devdigest/agent-runner"`, `"private": true`, `"type": "module"`, scripts: `"build": "esbuild src/main.ts --bundle --platform=node --target=node20 --format=cjs --minify --legal-comments=none --banner:js=\"/* DevDigest agent-runner — generated bundle, do not edit. */\" --outfile=dist/agent-runner.cjs"`, `"typecheck": "tsc --noEmit -p tsconfig.json"`, `"test": "vitest run"`; dependencies `yaml ^2.6.1`; devDependencies `esbuild`, `typescript ^5.7.2`, `vitest ^2.1.8`, `@types/node ^22.10.0`; `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }` (precedent: `evals/package.json:34`).
  - `agent-runner/tsconfig.json` — copy `server/tsconfig.json` compiler options (`moduleResolution: Bundler`, `strict`, `resolveJsonModule`, `noEmit: true`) with `paths`: `"@devdigest/shared": ["../server/src/vendor/shared/index.ts"]`, `"@devdigest/reviewer-core": ["../reviewer-core/src/index.ts"]`; `include: ["src/**/*.ts", "test/**/*.ts"]`. esbuild reads these `paths` when bundling.
  - `agent-runner/vitest.config.ts` — `resolve.alias` for the same two aliases (client INSIGHTS 2026-09-16: vitest does not read tsconfig paths).
  - `agent-runner/src/version.ts` — `export const RUNNER_VERSION = '0.1.0';` and `REVIEWER_CORE_VERSION` from `import rc from '../../reviewer-core/package.json'` (inlined by esbuild).
  - `agent-runner/src/manifest.ts` — `loadManifest(text: string): { ok: true; manifest: AgentManifest } | { ok: false; error: string }` = `yaml.parse` + `AgentManifest.safeParse` (the SAME shared schema — AC-1); also rejects any skill slug not matching `CI_SLUG_RE` (path-traversal guard; manifest is repo-editable).
  - `agent-runner/src/github.ts` — fetch-based client (no Octokit): `getPull(repo, n)` (JSON: `body`, `head.sha`, `head.repo.full_name`), `getDiff(repo, n)` (`Accept: application/vnd.github.v3.diff`), `postReview(repo, n, payload, commitId)` (`POST /repos/{r}/pulls/{n}/reviews`), `postComment(repo, n, body)` (`POST /repos/{r}/issues/{n}/comments`). Base URL from `GITHUB_API_URL` (default `https://api.github.com`), token from `GITHUB_TOKEN`.
  - `agent-runner/src/run.ts` — `export async function runAgent(deps: RunnerDeps): Promise<{ exitCode: number; result: CiRunResult | null }>` where `RunnerDeps = { env: Record<string,string|undefined>; readFile(path): Promise<string | null>; github: RunnerGitHub; makeLlm(key: string): LLMProvider; log(msg: string): void; now(): Date; args: { manifestPath: string; postAs: CiPostAs } }`. Order:
    1. Read event (`GITHUB_EVENT_PATH`) → PR number, head repo. If head repo ≠ `GITHUB_REPOSITORY` → log "skipping: PR from a fork, secrets unavailable" → exit 0, no result (defence in depth for AC-20).
    2. `loadManifest` → on failure log `Manifest validation failed: <error>` → **exit 2, no LLM call, no result** (AC-2).
    3. Resolve skills `.devdigest/skills/<slug>.md` (missing → failed result); sha256 each body (`node:crypto`) into `dependencies.skills`. Read `.devdigest/memory.jsonl` if present: each non-empty line `JSON.parse` → `{ text: string }`, invalid lines skipped, empty file tolerated (decision 12).
    4. No `OPENROUTER_API_KEY` → failed result `error: 'OPENROUTER_API_KEY secret is not set'`, exit 1 (AC-23).
    5. `parseUnifiedDiff(await github.getDiff(...))` — import from `../../server/src/adapters/git/diff-parser.js` (pure, type-only imports).
    6. `reviewPullRequest({ systemPrompt, model, diff, llm: makeLlm(key), strategy, skills, memory, prDescription: pull.body ?? undefined, task: \`Review PR #${n}\`, onEvent: (e) => log(e.msg) })`. Throw → failed result with message, exit 1 (AC-23).
    7. `blockers = countBlockers(findings, ci_fail_on)`, `gate = gateTriggered(findings, ci_fail_on)`.
    8. Post (AC-21): `github_review` → `toReviewPayload(review, { failOn, diff, title: manifest.name })`, map event `APPROVE` → `COMMENT` (Actions' `GITHUB_TOKEN` cannot approve by default), post with `commit_id = head sha`; `pr_comment` → `postComment` with the payload body; `none` → nothing. A post failure → status `failed`, error recorded, exit 1.
    9. Build `CiRunResult` (status `no_findings` / `succeeded` / `failed`; severity counts; `cost_usd` straight from `outcome.costUsd` — null stays null; `duration_ms`; `agent: manifest.name`; `version: String(manifest.version ?? '')`; `agent_slug` from the manifest file name; `repository`; `job_url = ${GITHUB_SERVER_URL}/${repo}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}`; run id/attempt; `model`; `manifest_version: manifest.version ?? null`; `commit_sha: head sha`; `dependencies: { skills, runner_version, reviewer_core_version }`; `finished_at`), and `CiRunResult.parse` it before returning.
    10. Exit code: failed → 1; `gate && ci_fail_on !== 'never'` → 1 (AC-22, decision 17); else 0.
  - `agent-runner/src/main.ts` — CLI entry: parse `--manifest <path> --post-as <mode>`, build real deps (`fs/promises`, `new OpenRouterProvider(key)`, `console.log`), call `runAgent`, write `devdigest-result.json` in cwd when `result` is non-null, then `process.exit(exitCode)`. No top-level `await` (CJS output): `main().then((c) => process.exit(c))`.
  - `agent-runner/test/run.test.ts` — hermetic, stubbed `LLMProvider` (implements `completeStructured` returning a fixed grounded `Review`) and stubbed `RunnerGitHub`: (a) invalid manifest → exit 2, `makeLlm` never called, no result; (b) missing key → exit 1, result status `failed`; (c) critical finding + `ci_fail_on: critical` → exit 1, `REQUEST_CHANGES` posted; (d) same + `never` → exit 0; (e) `post_as: none` posts nothing; (f) `pr_comment` posts a comment not a review; (g) fork event → exit 0, nothing posted; (h) manifest with `skills: null` validates; (i) result passes `CiRunResult.parse` and carries manifest version, model, deps, commit sha.
  - `agent-runner/CLAUDE.md` — 15-line package map (what it is, `pnpm build` regenerates the committed `dist/`, purity: all I/O behind `RunnerDeps`).
  - `agent-runner/dist/agent-runner.cjs` — produced by `pnpm build` and **committed**.
- **Layer:** n/a (standalone CI process; `run.ts` is the testable core, `main.ts`/`github.ts` are its I/O edge)
- **Interfaces:** CLI `node .devdigest/runner/agent-runner.cjs --manifest .devdigest/agents/<slug>.yaml --post-as <github_review|pr_comment|none>`; output file `devdigest-result.json`.
- **Skills to invoke:** `typescript-expert`, `zod`, `security`
- **Depends on:** Step 1
- **Done when:** `cd agent-runner && pnpm install && pnpm typecheck && pnpm test` pass; `pnpm build` produces `dist/agent-runner.cjs`; `node dist/agent-runner.cjs --manifest does-not-exist.yaml --post-as none` (with a fake `GITHUB_EVENT_PATH` pointing at a same-repo event JSON) exits non-zero with a readable error and does not crash on module load (proves the CJS bundle loads). Requires `server/` and `reviewer-core/` `node_modules` installed (bundling resolves `zod`/`openai` from there).

### Step 5 — `ci` module: domain helpers, generator, constants  ·  [backend]
- **Files (new):** `server/src/modules/ci/constants.ts`, `server/src/modules/ci/helpers.ts`, `server/src/modules/ci/generator.ts`, `server/src/modules/ci/runner-bundle.ts`.
- **Layer:** domain (`constants.ts`, `helpers.ts`, `generator.ts` — pure, may import `yaml`, `@devdigest/shared`, never `fastify`/`drizzle`/`adapters`/`container`/`db`), infrastructure-ish file read (`runner-bundle.ts`)
- **Interfaces:**
  - `constants.ts`: `CI_BRANCH = 'devdigest/ci'`, `CI_PR_TITLE = 'Add DevDigest CI review'`, `CI_COMMIT_MESSAGE = 'chore(ci): add DevDigest CI review'`, `ARTIFACT_PREFIX = 'devdigest-result-'`, `RESULT_FILE = 'devdigest-result.json'`, `RESULT_MAX_BYTES = 256 * 1024`, `CI_PATHS = { agent: (s) => \`.devdigest/agents/${s}.yaml\`, skill: (s) => \`.devdigest/skills/${s}.md\`, memory: '.devdigest/memory.jsonl', runner: '.devdigest/runner/agent-runner.cjs', workflow: (s) => \`.github/workflows/devdigest-${s}.yml\` }`, `TRIGGER_ORDER: CiTrigger[] = ['opened','synchronize','reopened']`, `CI_RUNS_LIMIT = 200`, `CI_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const`.
  - `helpers.ts`: `slugify(name: string): string` (lowercase, non-alphanumerics → `-`, collapse/trim dashes, fallback `'agent'`); `uniqueSlug(base: string, id: string, taken: Set<string>): string` (on collision append `-${id.slice(0, 6)}` — deterministic, decision 11); `assertRepoRef(owner: string, name: string): RepoRef` (throws `ValidationError` unless `${owner}/${name}` matches `CI_REPO_FULL_NAME_RE`) — NOTE: `ValidationError` lives in `platform/errors.ts`, which is allowed (not in the `no-domain-outward` forbidden list); `ciVerdict(status: string | null, findings: number | null): CiVerdict`; `isOutOfDate(workflowVersion: number | null, agentVersion: number): boolean` (`workflowVersion == null || workflowVersion < agentVersion`); `artifactPrefixFor(slug: string): string` (`${ARTIFACT_PREFIX}${slug}-`); `runKey(r: CiRunResult): string`.
  - `generator.ts` (pure, deterministic for the same inputs — NFR reproducibility):
    - `export interface CiGenerateInput { agent: { name: string; provider: Provider; model: string; systemPrompt: string; strategy: ReviewStrategy; ciFailOn: CiFailOn; version: number }; agentSlug: string; skills: { slug: string; body: string }[]; postAs: CiPostAs; triggers: CiTrigger[]; runnerBundle: string }`
    - `agentManifest(input): AgentManifest` — `AgentManifest.parse({ name, provider, model, system_prompt, skills: slugs, strategy, ci_fail_on, version })`.
    - `agentYaml(manifest: AgentManifest): string` — `yaml.stringify` with keys in fixed order `name, provider, model, version, strategy, ci_fail_on, skills, system_prompt`, `{ lineWidth: 0 }`, prefixed with a `# Generated by DevDigest — validated by the agent-runner against the shared AgentManifest schema.` comment line.
    - `workflowYaml({ agentName, agentSlug, postAs, triggers }): string` — template with: `name: ${JSON.stringify('DevDigest review: ' + agentName)}`; `on: pull_request: types: [<triggers in TRIGGER_ORDER order>]`; `permissions: { contents: read, pull-requests: write }`; one job `review` on `ubuntu-latest` with `env: SAME_REPO: ${{ github.event.pull_request.head.repo.full_name == github.repository }}`; steps: (1) `if: env.SAME_REPO != 'true'` → `run: echo "DevDigest: skipping review - PR comes from a fork; repository secrets are unavailable."` (AC-20, check passes); (2) `actions/checkout@v4` with `ref: ${{ github.event.pull_request.head.sha }}`, `if: env.SAME_REPO == 'true'`; (3) `actions/setup-node@v4` `node-version: 22`, same `if`; (4) `run: node .devdigest/runner/agent-runner.cjs --manifest .devdigest/agents/<slug>.yaml --post-as <postAs>` with `env: OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}, GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, same `if`; (5) `actions/upload-artifact@v4` with `if: always() && env.SAME_REPO == 'true'`, `name: devdigest-result-<slug>-${{ github.run_id }}-${{ github.run_attempt }}`, `path: devdigest-result.json`, `if-no-files-found: ignore`. Include the commented placeholder (decision 3, decision 1):
      ```yaml
      # Future: replace the run step above with the published action
      # - uses: devdigest/review-action@v1
      #   with:
      #     openrouter-key: ${{ secrets.OPENROUTER_API_KEY }}
      ```
      Only `agentSlug` (regex-checked) and `postAs` (enum) are interpolated into shell lines; the agent name only appears JSON-quoted in `name:`.
    - `generateCiFiles(input): CiFile[]` — in this order: manifest (`editable: false`), one `.md` per skill in link order (`editable: false`), `memory.jsonl` with empty contents (`editable: false`), runner bundle (`editable: false`), workflow (`editable: true`). Contents complete and untruncated.
  - `runner-bundle.ts`: `export function loadRunnerBundle(): string` — reads `join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'agent-runner', 'dist', 'agent-runner.cjs')` once and caches it (pattern: `server/src/platform/prompts.ts:20`); missing file → `ConfigError('agent-runner bundle not found — run "cd agent-runner && pnpm build"')`.
- **Skills to invoke:** `onion-architecture`, `typescript-expert`, `security`
- **Depends on:** Steps 1, 3 (`yaml` dep), 4 (bundle file exists)
- **Done when:** `server/test/ci-generator.test.ts` (new, hermetic) passes, covering: identical input → identical output; `yaml.parse(agentYaml(m))` round-trips through `AgentManifest.parse` to an equal object (incl. a multi-line system prompt with `:`/`#`/quotes); empty skills → no skill files and `skills: []`; only the workflow file has `editable: true`; workflow types follow the trigger selection; workflow contains the fork-skip step, `if: always()` on upload, the `--post-as` value, the commented `devdigest/review-action@v1` placeholder, `OPENROUTER_API_KEY` secret reference and **no** `OPENAI_API_KEY`; no file contains a secret value; `slugify`/`uniqueSlug` collision suffix; `assertRepoRef` rejects `a/b;rm -rf`.

### Step 6 — `ci` module: repository  ·  [backend]
- **Files:** `server/src/modules/ci/repository.ts` (new)
- **Layer:** persistence
- **Interfaces** — `export class CiRepository { constructor(private db: Db) {} ... }`:
  - `getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined>` (`t.repos` by workspace + id).
  - `listInstallations(workspaceId: string, agentId?: string): Promise<(InstallationRow & { agentVersion: number; agentName: string })[]>` (inner join `t.agents` on workspace).
  - `findInstallation(agentId: string, repo: string, target: CiTarget): Promise<InstallationRow | undefined>`.
  - `upsertInstallation(v: { agentId; repo; targetType; agentSlug; workflowVersion; prUrl: string | null }): Promise<InstallationRow>` — `insert ... onConflictDoUpdate({ target: [agentId, repo, targetType], set: { agentSlug, workflowVersion, prUrl, updatedAt: new Date() } })`.
  - `knownRunKeys(keys: string[]): Promise<Set<string>>`.
  - `insertCiRun(workspaceId: string, agentId: string, r: CiRunResult, trace: RunTrace): Promise<boolean>` — one `db.transaction`: insert `agent_runs` `{ workspaceId, agentId, prId: null, ranAt: new Date(r.finished_at), provider: 'openrouter', model: r.model, durationMs: r.duration_ms ?? null, tokensIn: r.tokens_in ?? null, tokensOut: r.tokens_out ?? null, costUsd: r.cost_usd, status: r.status === 'failed' ? 'failed' : 'done', error: r.error ?? null, source: 'ci', findingsCount: r.findings_count, blockers: r.blockers, score: null, ciRepo: r.repository, ciPrNumber: r.pr_number ?? null, ciJobUrl: r.job_url, ciRunKey: runKey(r) }` with `.onConflictDoNothing({ target: t.agentRuns.ciRunKey }).returning({ id })`; if a row came back, insert `run_traces { runId, trace }`; return whether inserted (AC-28).
  - `listCiRuns(workspaceId: string, opts: { agentId?: string; limit: number }): Promise<CiRunDbRow[]>` — `where source = 'ci'` (AC-33) + workspace (+ agent), left join `t.agents` for name (deleted agent → null name, edge case), `orderBy(desc(ranAt))`, `limit`.
  - `latestRunsByInstallation(workspaceId, agentIds: string[]): Promise<{ agentId; repo; status; findingsCount; blockers; ranAt }[]>` — newest `source='ci'` row per `(agent_id, ci_repo)` (`selectDistinctOn([agentId, ciRepo])` ordered by `ranAt desc`).
- **Skills to invoke:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`
- **Depends on:** Steps 1, 2, 5
- **Done when:** `pnpm typecheck && pnpm arch` pass (all `drizzle-orm` imports live in this file only).

### Step 7 — `ci` module: service (preview, install, overview, runs, sync)  ·  [backend]
- **Files:** `server/src/modules/ci/service.ts` (new), `server/src/platform/container.ts` (edit — add a lazily-constructed `ciRepo` getter only if the service needs it from outside; otherwise the service constructs `new CiRepository(container.db)` itself like other modules — prefer the latter, no container edit).
- **Layer:** application
- **Interfaces** — `export class CiService { constructor(private container: Container) {} }`:
  - `preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview>` — load agent (`container.agentsRepo.getById`; missing → `NotFoundError`); `agent.provider !== 'openrouter'` → `throw new AppError('ci_provider_unsupported', 'Export to CI supports OpenRouter agents only. Switch this agent to an OpenRouter model to export it.', 409)` (AC-3); `input.target !== 'gha'` → `ValidationError('Only GitHub Actions is supported')` (AC-5 server side); repo row (missing → 404) + `assertRepoRef`; skills = `linkedSkills` filtered `enabled`, slugs via `uniqueSlug(slugify(name), id, taken)`; agent slug = existing installation's `agentSlug` ?? `uniqueSlug(slugify(agent.name), agent.id, slugsOfOtherWorkspaceAgents)`; files = `generateCiFiles(...)` with `loadRunnerBundle()`; `exists` via `(await container.github()).existingPaths(ref, repo.defaultBranch, paths)` wrapped in try/catch → on any error every `exists: false` (decision 8 best-effort); `openrouter_key_ready = !!(await container.secrets.get('OPENROUTER_API_KEY'))` (AC-13).
  - `install(workspaceId, agentId, input: CiInstallInput): Promise<CiExport>` — rebuild files exactly as `preview` (same guards); if `input.workflow` is given, replace ONLY the workflow file's contents (AC-8 enforced server-side: no other file is accepted from the client). `action === 'open_pr'`: `gh = await container.github()`; guard `CI_BRANCH !== repo.defaultBranch` (AC-15); `gh.commitFiles(ref, { branch: CI_BRANCH, base: repo.defaultBranch, message: CI_COMMIT_MESSAGE, files })`; `pr = (await gh.findOpenPr(ref, CI_BRANCH)) ?? (await gh.openPullRequest(ref, { title: CI_PR_TITLE, head: CI_BRANCH, base: repo.defaultBranch, body }))` (body: one line per file + "Add `OPENROUTER_API_KEY` to the repository's Actions secrets."). Any throw from `container.github()`/GitHub → `throw new ExternalServiceError('Could not open the pull request on GitHub. Check the GitHub token in Settings and try again, or download the files as a zip.')` and **no upsert** (AC-16, partial failure edge case). Only after success: `upsertInstallation({ ..., workflowVersion: agent.version, prUrl })` (AC-18). `action === 'files'`: no GitHub call, upsert with `prUrl: null`, return files (decision 6).
  - `agentOverview(workspaceId, agentId): Promise<AgentCiOverview>` — installations → `CiInstallationView` with `out_of_date = isOutOfDate(workflowVersion, agent.version)` (AC-36) and `latest_run` from `latestRunsByInstallation` (null → "no runs yet", decision 15); `runs = listCiRuns({ agentId, limit: CI_RUNS_LIMIT })` mapped to `CiRunRow` (`status = ciVerdict(...)`, `blocking = (blockers ?? 0) > 0`, decision 6).
  - `listRuns(workspaceId): Promise<CiRunRow[]>`.
  - `sync(workspaceId, agentId: string | undefined, log: FastifyBaseLogger-compatible { warn, info }): Promise<CiSyncResult>` — (type the logger as a minimal local interface `{ info(o: unknown, m?: string): void; warn(o: unknown, m?: string): void }` so the service does not import `fastify`). For each installation with an `agentSlug`: `listArtifacts(ref, artifactPrefixFor(slug))` → drop names whose run key is already known (parse `<runId>-<attempt>` suffix from the name, `knownRunKeys`) → `readArtifactFile(..., RESULT_FILE, RESULT_MAX_BYTES)` → `JSON.parse` in try/catch → `CiRunResult.safeParse`; reject (log `warn` with artifact name + reason, `skipped++`, write nothing — AC-27) when invalid OR `repository.toLowerCase() !== installation.repo.toLowerCase()` OR `agent_slug !== installation.agentSlug`; else build the `RunTrace` (`config: { agent: name, version: String(manifest_version ?? ''), provider: 'openrouter', model, pr: pr_number ?? null, source: 'ci', manifest_version, commit_sha, dependencies }`, `stats: { duration_ms: duration_ms ?? 0, tokens_in: tokens_in ?? 0, tokens_out: tokens_out ?? 0, cost_usd, findings: findings_count, grounding: '' }`, `prompt_assembly: { system: '', user: '' }`, `tool_calls: []`, `raw_output: ''`, `memory_pulled: []`, `specs_read: []`, `log: [{ t: '00.00', kind: 'info', msg: \`Ingested from GitHub Actions: ${job_url}\` }]`) validated with `RunTrace.parse`, then `insertCiRun` (AC-25, AC-30). Any GitHub/credential error → stop, return `{ ingested, skipped, error: 'Could not fetch CI results from GitHub: <short reason>' }` — never throw (AC-29).
- **Skills to invoke:** `onion-architecture`, `typescript-expert`, `security`
- **Depends on:** Steps 3, 5, 6
- **Done when:** `pnpm typecheck && pnpm arch` pass — `service.ts` imports no `adapters/` file, no `fastify`, no `drizzle-orm`, and nothing from another module's folder (agents data via `container.agentsRepo`).

### Step 8 — `ci` module: routes + registry  ·  [backend]
- **Files:** `server/src/modules/ci/routes.ts` (new), `server/src/modules/index.ts` (edit: `import ci from './ci/routes.js';` + `ci,` entry).
- **Layer:** presentation
- **Interfaces** (pattern: `server/src/modules/eval/routes.ts`; every handler calls `getContext(container, req)` first, then one service method):
  - `POST /agents/:id/export-ci/preview` — `params: IdParams`, `body: CiPreviewInput`, `response: { 200: CiPreview }`.
  - `POST /agents/:id/export-ci` — `params: IdParams`, `body: CiInstallInput`, `response: { 200: CiExport }`, `config: { rateLimit: CI_RATE_LIMIT }`.
  - `GET /agents/:id/ci` — `params: IdParams`, `response: { 200: AgentCiOverview }`.
  - `GET /ci/runs` — `response: { 200: z.array(CiRunRow) }`.
  - `POST /ci/sync` — `body: CiSyncInput.nullish()` (server INSIGHTS 2026-10-11: body-less POST arrives as `null`), handler uses `req.body ?? {}`, `response: { 200: CiSyncResult }`, `config: { rateLimit: CI_RATE_LIMIT }`, passes `req.log`.
  - No route accepts CI results from a caller (AC-26).
- **Skills to invoke:** `fastify-best-practices`, `security`, `onion-architecture`
- **Depends on:** Step 7
- **Done when:** `server/test/ci-routes.test.ts` (new, hermetic — stub `agentsRepo` / `CiRepository.prototype` with `vi.spyOn`, inject `MockGitHubClient` + `MockSecretsProvider` via `ContainerOverrides`, as `eval-routes.test.ts` does) passes: 422 for `triggers: ['closed']` and for a non-uuid id; 409 `ci_provider_unsupported` for an `openai` agent on both preview and install; preview marks a path from `existingPaths` as `exists: true` and reports `openrouter_key_ready` per the mock secret; install `open_pr` calls `commitFiles` with `branch: 'devdigest/ci'` and `base` = the repo row's `defaultBranch`, opens a PR titled `Add DevDigest CI review`, upserts once with `workflowVersion = agent.version`; install with an edited `workflow` commits that text for the workflow path and generator output for every other path; `commitFiles` rejecting → 502 and `upsertInstallation` never called; `action: 'files'` makes no GitHub call.

### Step 9 — Server integration test for ingestion and listing  ·  [backend]
- **Files:** `server/test/ci.it.test.ts` (new; must end in `.it.test.ts` — it imports `test/helpers/pg.ts`).
- **Layer:** n/a (test)
- **Interfaces:** build the app with `ContainerOverrides { github: new MockGitHubClient({ artifacts: [...] }), secrets: new MockSecretsProvider({}) }` (server INSIGHTS 2026-09-28: always override secrets).
- **Skills to invoke:** `drizzle-orm-patterns`, `typescript-expert`
- **Depends on:** Steps 2, 8
- **Done when:** passes with Docker, covering: install (`files`) then `POST /ci/sync` ingests one valid artifact → one `agent_runs` row `source='ci'`, `status='done'`, `pr_id` null, `cost_usd` null preserved, and a `run_traces` row whose `config.source='ci'` with `manifest_version`, `model`, `dependencies`, `commit_sha` (AC-25, AC-30, AC-34); a second sync creates no duplicate (AC-28); an artifact with bad JSON / wrong `repository` is skipped and counted (AC-27); `GET /ci/runs` excludes a seeded `source='local'` run and is newest-first (AC-33); `GET /agents/:id/ci` shows `latest_run` and, after `PUT /agents/:id { ci_fail_on: 'any' }`, `out_of_date: true` (AC-36); a mock whose `listArtifacts` throws → sync returns 200 with `error` set and previously ingested runs still listed (AC-29).

### Step 10 — Client data hooks + zip helper  ·  [frontend]
- **Files:** `client/src/lib/hooks/ci.ts` (new), `client/src/lib/hooks/index.ts` (edit: `export * from "./ci";`), `client/package.json` (edit: add `"fflate": "^0.8.2"`; `pnpm install`; delete a stray `pnpm-workspace.yaml` if written).
- **Layer:** n/a (client data layer)
- **Interfaces** (types only from `@devdigest/shared` — never a schema value, client INSIGHTS 2026-09-22):
  - `useAgentCi(agentId)` — `useQuery(["agent-ci", agentId], GET /agents/:id/ci)`.
  - `useCiRuns()` — `useQuery(["ci-runs"], GET /ci/runs)`.
  - `useCiSync()` — `useMutation((agentId?: string) => api.post<CiSyncResult>("/ci/sync", agentId ? { agent_id: agentId } : {}))`, `onSuccess` invalidates `["ci-runs"]` and `["agent-ci"]`.
  - `useCiPreview(agentId)` — mutation `POST /agents/:id/export-ci/preview` (`CiPreviewInputBody` → `CiPreview`).
  - `useCiInstall(agentId)` — mutation `POST /agents/:id/export-ci` (`CiInstallInputBody` → `CiExport`), `onSuccess` invalidates `["agent-ci", agentId]`; no toast on error (the wizard shows it inline).
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `security`
- **Depends on:** Steps 1, 8
- **Done when:** `cd client && pnpm typecheck` passes.

### Step 11 — Shared CI runs table component  ·  [frontend]
- **Files (new):** `client/src/components/ci-runs-table/{CiRunsTable.tsx,index.ts,styles.ts,helpers.ts,CiRunsTable.test.tsx}`.
- **Layer:** n/a
- **Interfaces:** `CiRunsTable({ runs }: { runs: CiRunRow[] })` — columns Timestamp, Repository, Pull request (`#n`), Agent (null → "Unknown agent"), Verdict (status chip `succeeded` / `no_findings` / `failed` + a "blocking" chip when `blocking`), Findings, Cost (`cost_usd == null` → "—", never `$0.00` — AC-34; reuse `client/src/lib/format.ts` cost formatter), Duration, Job (`<a href={job_url} target="_blank" rel="noopener noreferrer">View</a>`, only when `job_url` starts with `https://`). `helpers.ts`: `verdictKey(status)` → `ci.runs.status.*` key. Strings from `ci.json`.
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`
- **Depends on:** Step 10
- **Done when:** `CiRunsTable.test.tsx` passes: null cost renders "—"; a `blocking` run shows the blocking marker; the View link has `rel="noopener noreferrer"`.

### Step 12 — CI Runs page + sidebar entry  ·  [frontend]
- **Files:** `client/src/app/ci-runs/page.tsx` (new), `client/src/app/ci-runs/_hooks/useCiRunsPage.ts` (new), `client/src/app/ci-runs/_components/CiRunsFilters/{CiRunsFilters.tsx,index.ts,styles.ts}` (new), `client/src/app/ci-runs/styles.ts` (new), `client/src/app/ci-runs/page.test.tsx` (new), `client/src/vendor/ui/nav.ts` (edit — data only: append `{ section: "GLOBAL", items: [{ key: "ci-runs", label: "CI Runs", icon: "Workflow", href: "/ci-runs" }] }` to `NAV`), `client/src/components/app-shell/helpers.test.ts` (edit: assert the GLOBAL group holds `ci-runs` → `/ci-runs`).
- **Layer:** n/a
- **Interfaces:** `useCiRunsPage()` returns `{ runs (filtered), isLoading, isError, refetch, refresh(), syncing, syncError, filters, setFilter, options }`; it fires `useCiSync().mutate()` once on mount and on `refresh()`; filters (client-side over the fetched list): period `7d` (default) / `30d` / `all`, agent (all | id), repo (all | name), status (all | verdict). Page: `AppShell` with crumb `ci.page.crumb`, title `ci.runs.title` + subtitle, filters row + Refresh button (`ci.runs.refresh` / `refreshing`), non-blocking inline warning when `syncError` (table stays visible — AC-29), `ErrorState` with retry on query error, `Skeleton` while loading, `EmptyState` (`ci.runs.emptyTitle`/`emptyBody`) when there are no runs (AC-32), else `CiRunsTable`. Pattern: `client/src/app/eval/page.tsx`.
- **Skills to invoke:** `next-best-practices`, `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`
- **Depends on:** Steps 10, 11
- **Done when:** `page.test.tsx` (fetch mocked) passes: empty state with no runs; error state with a working retry; a sync response with `error` shows the warning while rows stay rendered; rows come in server order (newest first). `helpers.test.ts` passes.

### Step 13 — Export Wizard  ·  [frontend]
- **Files (new):** `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/{ExportWizard.tsx,index.ts,styles.ts,constants.ts,helpers.ts,useExportWizard.ts,ExportWizard.test.tsx}` and step components `.../ExportWizard/_components/{TargetStep,PreviewStep,ConfigureStep,InstallStep}/{Name.tsx,index.ts}`.
- **Layer:** n/a
- **Interfaces:**
  - `ExportWizard({ agent, repo, initialStep, onClose }: { agent: Agent; repo: Repo; initialStep: 0 | 1; onClose: () => void })` rendered in `@devdigest/ui` `Modal` (title `exportWizard.title`, subtitle `exportWizard.subtitle` with `agentName`). Stepper of four labelled steps (`exportWizard.steps.*`), completed steps show a `Check` icon, current step has `aria-current="step"`, and a visually-hidden `aria-live="polite"` region announces "Step N of 4: <label>" (NFR accessibility). Footer: Back / Continue, last step Install (`installing` while pending).
  - `useExportWizard({ agentId, repoId, initialStep })` — state lives in the hook until the modal unmounts (AC-10): `step`, `target: 'gha'`, `postAs` (default `github_review`), `triggers` (default `['opened','synchronize']`), `preview: CiPreview | null`, `workflowDraft: string | null` (user edits), `selectedPath`, `installMode: 'open_pr' | 'zip'` (default `open_pr`), `installError: string | null`, `result: CiExport | null`. Continue on step 1 → `useCiPreview` (AC-6); when `initialStep === 1` ("Update CI config", AC-37) the hook requests the preview on mount. Changing triggers/post-as on Configure → re-request preview (AC-11, AC-12) and reset `workflowDraft` to null (see Risks: edits are replaced; when a draft exists show an inline note "Changing these settings regenerates the workflow and replaces your edits"). Install `open_pr` → `useCiInstall({ repo_id, post_as, triggers, action: 'open_pr', workflow: workflowDraft ?? undefined })`; on error stay on step 4, set `installError` from `ApiError.message`, switch `installMode` to `zip` and keep the zip card offered (AC-16). Install `zip` → `useCiInstall({ ..., action: 'files' })` then `downloadZip(filesWithDraft)` (AC-17) and show the "downloaded" confirmation; success with `pr_url` shows the PR link (AC-18).
  - `helpers.ts`: `applyDraft(files: CiPreviewFile[], draft: string | null): CiPreviewFile[]`; `buildZip(files): Blob` using `fflate` `zipSync(Object.fromEntries(files.map(f => [f.path, strToU8(f.contents)])))`; `downloadZip(files, fileName = 'devdigest-ci.zip')` (object URL + temporary anchor, revoke after click).
  - `TargetStep` — four cards from `constants.ts` `TARGETS = [{ key:'gha', recommended:true, enabled:true }, { key:'circle', enabled:false }, { key:'jenkins', enabled:false }, { key:'cli', enabled:false }]`; disabled cards are `<button disabled aria-disabled="true">` and cannot be selected (AC-5); GHA preselected with the `recommended` chip (AC-4). If the agent provider is not `openrouter`, render the server's 409 message and disable Continue (AC-3).
  - `PreviewStep` — left "FILES TO CREATE" list (path, `editable` badge on the workflow, "will be overwritten" badge when `exists` — AC-9); right pane: `<pre>` scrollable with full contents for read-only files, `Textarea` bound to `workflowDraft ?? contents` for the editable one (AC-7, AC-8).
  - `ConfigureStep` — trigger checkboxes `pull_request:opened`, `pull_request:synchronize`, `pull_request:reopened` (`Checkbox`; at least one must stay checked); "Secrets expected": `OPENROUTER_API_KEY` badge `ready` when `preview.openrouter_key_ready` else `not set`, `GITHUB_TOKEN` "Auto-provided by Actions" + `ready`, caption "Repository secrets can't be read from here — this only checks the key stored in DevDigest." (AC-13); "Post results as" radio cards (GitHub review recommended/default, PR comment, None (exit code only)); info note: "Fail CI on" + required status check, "No GitHub App needed".
  - `InstallStep` — card "Open a PR with these files" (recommended, preselected; body `installCardBody` with `{repo}` and `{count}` = `preview.files.length`, computed — decision 3) vs card "Download files as a zip" (decision 17); help link "GitHub Action setup docs" → `https://docs.github.com/actions` (`rel="noopener noreferrer"`); inline error block when `installError`.
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`
- **Depends on:** Step 10
- **Done when:** `ExportWizard.test.tsx` (fetch mocked) passes: CircleCI/Jenkins/CLI buttons are disabled and clicking them does not change selection; Continue requests the preview and lists manifest, skill file, `memory.jsonl`, runner and workflow; only the workflow pane is a textbox; an `exists: true` file shows "will be overwritten"; editing the workflow, going Back and forward keeps the edit; unchecking `reopened`/checking it re-requests the preview with the new `triggers`; badge reads `not set` when `openrouter_key_ready` is false; a 502 install response keeps step 4, shows the message and the zip option; `initialStep={1}` opens directly on Preview.

### Step 14 — Agent CI tab + tab registration + copy  ·  [frontend]
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/{CiTab.tsx,index.ts,styles.ts,helpers.ts,useAgentCiTab.ts,CiTab.test.tsx}` (new), `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (edit: append `{ key: "ci", labelKey: "editor.tabs.ci", icon: "Workflow" }`), `client/src/app/agents/[id]/_hooks/useAgentTab.ts` (edit: add `"ci"` to `VALID_TABS` — client INSIGHTS 2026-09-22: both lists or the tab never renders), `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (edit: `tab === "ci" ? <CiTab agent={agent} /> :` branch; update header comment), `client/messages/en/ci.json` (edit).
- **Layer:** n/a
- **Interfaces:**
  - `CiTab({ agent }: { agent: Agent })`; `useAgentCiTab(agent)` uses `useActiveRepo()` (current workspace repo — decision 10), `useAgentCi`, `useCiSync` (mutate once on mount with `agent.id`, AC-25), `useUpdateAgent`; returns `{ overview, isLoading, isError, refetch, repo, providerBlocked, currentInstallation, wizard: { open: boolean; initialStep: 0 | 1 }, openAdd(), openUpdate(), closeWizard(), setFailOn(v: CiFailOn), syncError }`.
  - Layout: heading "CI deployment" + chip "Active in {count} repos"; buttons "Update CI config" (enabled only when the current repo has an installation; opens wizard at step index 1 — AC-37) and "Add to CI" (step 0 — AC-4); one row per installation: repo, target chip "GitHub Actions", latest-run status chip + relative time (`latest_run` null → "no runs yet", no chip — decision 15), "Workflow version v{n}", "Out of date" chip when `out_of_date`, PR link when `pr_url`; dashed "Add repository" row (same as Add to CI). No repo selected → `ciTab.noRepo` and disabled buttons. `agent.provider !== 'openrouter'` → notice "Export to CI supports OpenRouter agents only" and disabled buttons (AC-3). "Fail CI on" `SelectInput` (never / critical / warning / any) whose change calls `useUpdateAgent({ id, patch: { ci_fail_on } })` then invalidates `["agent-ci", agent.id]` (AC-36). "History" section → `CiRunsTable` with `overview.runs` (AC-35). Use a local `relativeTime` helper as `PRRow` does (client INSIGHTS 2026-10-04: avoid `useFormatter().relativeTime`).
  - `ci.json` edits: replace `exportWizard.blockMergeTitle`/`blockMergeDesc` with `failCiNoteTitle` ("Fail CI on") and `failCiNoteBody` ("The job fails when findings reach this agent's \"Fail CI on\" level. Mark the check as required in branch protection to block merging — no GitHub App needed."); add `exportWizard.{secretsLabel, ready, notSet, autoProvided, secretsCaption, zipCardTitle ("Download files as a zip"), zipCardBody, zipDone, prOpened, viewPr, setupDocs, willOverwrite, regenerateWarning, providerBlocked, triggerOpened, triggerSynchronize, triggerReopened, stepAnnounce ("Step {n} of 4: {label}")}`; add `ciTab.{deployHeading ("CI deployment"), activeIn ("Active in {count} repos"), updateConfig ("Update CI config"), addToCi ("Add to CI"), addRepository ("Add repository"), noRunsYet ("no runs yet"), workflowVersion ("Workflow version v{version}"), outOfDate ("Out of date"), failOnLabel ("Fail CI on"), failOn.{never,critical,warning,any}, history ("History"), providerBlocked}`; add `runs.{verdict, blocking, repository, agent, duration, job, unknownAgent, syncError, filters.last30Days, filters.allTime}`. Keep `publishDialog` (scaffolding, superseded; leave unused rather than delete).
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`, `next-best-practices`
- **Depends on:** Steps 10, 11, 13
- **Done when:** `CiTab.test.tsx` passes: `/agents/:id?tab=ci` (via `useAgentTab`) renders the CI tab; an installation without runs shows "no runs yet"; an out-of-date installation shows the chip; changing "Fail CI on" sends `PUT /agents/:id` with `{ ci_fail_on }`; "Add to CI" opens the wizard on Target, "Update CI config" opens it on Preview; an `openai` agent shows the provider notice with disabled buttons. Existing `AgentEditor.test.tsx` still passes.

### Step 15 — Docs + CI workflow for the runner  ·  [full-stack]
- **Files:** `server/specs/api-contract.md` (edit: the five routes, bodies, error codes `ci_provider_unsupported` 409 / `external_service_error` 502), `client/specs/ui-flows.md` (edit: `/ci-runs` and the agent `?tab=ci` flow), root `CLAUDE.md` (edit: one repo-map row `agent-runner/` · `@devdigest/agent-runner` · "Bundled CI runner — committed `dist/agent-runner.cjs` is copied into exported repos"), `TESTING.md` (edit: one suite-map row), `.github/workflows/agent-runner.yml` (new: on PRs touching `agent-runner/**`, `server/src/vendor/shared/**`, `reviewer-core/src/**`, `server/src/adapters/git/diff-parser.ts`; installs `server`, `reviewer-core`, `agent-runner` deps; runs `pnpm typecheck`, `pnpm test`, `pnpm build`, then `git diff --exit-code agent-runner/dist` to fail on a stale committed bundle).
- **Layer:** n/a
- **Skills to invoke:** `engineering-insights` (record the CJS-bundle finding and the R2 status mapping at wrap-up)
- **Depends on:** Steps 4, 8, 12, 14
- **Done when:** docs list exactly the shipped routes; the workflow file is valid YAML and mirrors the install pattern of `.github/workflows/reviewer-core.yml`.

## Contract changes
| File | Server copy | Client copy |
|---|---|---|
| `contracts/ci-export.ts` (new) | add | add, byte-identical, CRLF |
| `contracts/eval-ci.ts` | `AgentManifest` + `version` field | import `Provider`, `CiFailOn`; add whole `AgentManifest` block (with `version`) |
| `contracts/trace.ts` | `RunDependencies` + 3 optional `RunTrace.config` fields | same edit |
| `index.ts` | `export * from './contracts/ci-export.js'` | same |
| `adapters.ts` | `WorkflowArtifact` + 3 `GitHubClient` methods | **not mirrored** — client copy's `GitHubClient` already lacks `commitFiles`/`findOpenPr` (pre-existing drift, root INSIGHTS 2026-09-16); the client never uses this interface |

`CiExportInput`, `CiRun` and the `ci_runs` table stay as unused scaffolding.

## Database
- `ci_installations`: + `agent_slug text`, `workflow_version integer`, `pr_url text`, `updated_at timestamptz not null default now()`, unique index `ci_installations_agent_repo_target_uq (agent_id, repo, target_type)`.
- `agent_runs`: + `ci_repo text`, `ci_pr_number integer`, `ci_job_url text`, `ci_run_key text`, unique index `agent_runs_ci_run_key_uq (ci_run_key)`, index `agent_runs_source_ran_at_idx (source, ran_at)`.
- One migration via `cd server && pnpm db:generate` (add-only → non-interactive). Existing migrations and `meta/_journal.json` are append-only. Apply with `pnpm db:migrate`.

## Verification
1. `cd agent-runner && pnpm install && pnpm typecheck && pnpm test && pnpm build` — then `git status agent-runner/dist` shows the bundle (commit it).
2. `cd server && pnpm install && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm arch`
3. `cd server && pnpm exec vitest run .it.test` (Docker) — includes `ci.it.test.ts`.
4. `cd client && pnpm install && pnpm typecheck && pnpm test && pnpm lint`
5. Vendored copy check: `git diff --no-index server/src/vendor/shared/contracts/ci-export.ts client/src/vendor/shared/contracts/ci-export.ts` prints nothing.
6. End-to-end (manual, real GitHub sandbox repo you own, GitHub PAT with `repo` + `workflow` scopes stored in Settings, an OpenRouter agent):
   1. `./scripts/dev.sh`, `cd server && pnpm db:migrate`; import the sandbox repo; select it in the sidebar.
   2. Agent page → `?tab=ci` → "Add to CI" → GitHub Actions preselected, others disabled → Continue → Preview lists 5 + N skill files; workflow editable; Configure: `OPENROUTER_API_KEY` badge reflects the local key → Install "Open a PR" → PR "Add DevDigest CI review" opens from `devdigest/ci` against the default branch; the default branch has no new commit.
   3. Add `OPENROUTER_API_KEY` to the sandbox repo's Actions secrets; merge the PR; open a PR with a small code change → the "DevDigest review" job runs, posts a GitHub review, uploads `devdigest-result-<slug>-<run_id>-1`.
   4. Studio sidebar → GLOBAL → CI Runs → Refresh → one row with repo, PR number, agent, verdict, findings, cost (or "—"), duration and a working "View" job link; local runs absent. Refresh again → still one row.
   5. Agent CI tab → installation row shows the latest run's status chip and time, "Workflow version v<N>"; change "Fail CI on" to `any` → "Out of date" appears; "Update CI config" opens on Preview; Install updates the same PR (no second PR).
   6. Zip path: in the wizard pick "Download files as a zip" → the downloaded zip contains exactly the previewed files including a workflow edit.

## Risks / open questions
- **Spec conflict — AC-4 vs AC-37 (Step 14):** AC-4 says "Update CI config" opens the wizard at step 1; AC-37 says it runs from step 2. The plan follows the more specific AC-37 (`initialStep = 1`). One constant to flip if the user prefers AC-4.
- **Spec conflict — AC-10 vs AC-11 (Step 13):** Configure comes after Preview, so a trigger/post-as change after a workflow edit must either keep the stale edit or regenerate. The plan regenerates and replaces the edit, with an inline warning when an edit exists. Confirm, or choose "keep edits and skip regeneration".
- **Interpretation — AC-18 for zip (Step 7):** the plan persists an installation for the zip path too (`action: 'files'`), because sync only fetches artifacts for installed repos. If the user wants zip to persist nothing, those runs will never appear in CI Runs.
- **Bundle loading (Step 4):** ESM bundling of `openai` fails at runtime with "Dynamic require of … is not supported" — that is why the output is CJS. If `node dist/agent-runner.cjs` still fails on load, try `--packages=bundle` with `--main-fields=main,module` before anything else. Bundling resolves `zod` from `server/node_modules` and `openai` from `reviewer-core/node_modules`, so two zod copies may get bundled; this is harmless because the runner never compares schemas across copies with `instanceof`.
- **Bundle size / Preview (Steps 4, 13):** the minified bundle is probably a few hundred KB on one line. It still gets shown in full in the scrolling `<pre>` (AC-7); if that makes the browser lag, a follow-up could collapse it behind a "Show contents" toggle.
- **`GITHUB_TOKEN` cannot APPROVE** by default, so the runner maps APPROVE to COMMENT (Step 4). REQUEST_CHANGES and the non-zero exit still enforce the gate.
- **The PAT needs the `workflow` scope** to commit `.github/workflows/*` (classic PAT) and Actions read access to download artifacts. Missing either gives the generic AC-16 / AC-29 error. Diagnosing scopes is out of scope.
- **Out-of-date detection only sees `agents.version`.** Skill body edits or skill re-linking may not bump the agent version, so an installation may not show "out of date" after skill changes (Steps 7, 14). Decision 14 defines "workflow version" as the agent version, so this matches the spec.
- **Ingest reads one artifact page (≤100 newest) per repo.** In a very busy repo, older artifacts beyond the first page that were never ingested are missed, in the same way as the expiry limitation in decision 4.
- **`server/package.json` is marked skip-worktree on the original author's machine (TESTING.md).** In a fresh worktree the flag is not set. If the `fflate`/`yaml` additions don't show up in `git status`, run `git update-index --no-skip-worktree server/package.json`.
- **Adjacent, not planned:** the client copy of `adapters.ts` drift; deleting the superseded `publishDialog` strings and the `ci_runs` table; an e2e flow for `/ci-runs`; a stable `now` for next-intl relative time.

## Do-not-touch confirmations
- `server/src/db/migrations/**` — only a new generated `0016_*` migration plus its journal/snapshot append; no existing file is edited.
- `client/src/vendor/ui/**` — only `nav.ts` data gets one appended `NAV` group (allowed precedent: client INSIGHTS 2026-09-22); no component or layer file changes.
- `server/src/vendor/shared/**` / `client/src/vendor/shared/**` — edited together per the Contract changes table; `adapters.ts` is server-only by design (already drifted).
- `server/clones/**`, `client/.next/**`, `**/test-results/**` — untouched. The service never writes into clones.
- `skills-lock.json` — untouched.
- Lesson scaffolding — `ci_runs`, `CiExportInput`, `CiRun` and `publishDialog` strings stay in place, unused.
- Scope fence — no edits under `server/src/modules/reviews/**` (multi-run service / run executor), `server/src/modules/pulls/**`, or the client PR feed (`client/src/app/repos/[repoId]/pulls/**`). CI rows keep `pr_id = null`, so the PR feed queries never see them.
