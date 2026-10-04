# Plan — L04 `devdigest-mcp`: MCP server exposing PR review as 5 tools
**Request:** Add a new top-level package `devdigest-mcp/`. It is a stdio MCP server that lets external LLM clients (Claude Desktop, Claude Code) use DevDigest's existing PR-review functionality through 5 tools: `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius` (mock only). It talks to the running Fastify API on `:3001` over HTTP only. **Revision 2:** the tool surface follows four tool-design principles (result not operation · flat arguments · concise structured response · errors lead onward), see **Design principles**.
**Status:** READY FOR IMPLEMENTER
**Packages touched:** devdigest-mcp (new) · root `CLAUDE.md` (one repo-map row). No change to server, client, reviewer-core, e2e or shared.
**Out of scope:**
- Any server-side change: no new route, no new module, no change to `server/src/modules/repo-intel/**`, no Blast Radius HTTP endpoint. `get_blast_radius` is a **static client-side mock** in this lesson.
- Any DB change or migration.
- Any `@devdigest/shared` edit (either copy).
- A "check run status" tool, a `list_repos`/`list_pulls` tool, or PR-number → uuid resolution inside the tools (see Risks).
- Cancelling server runs when `run_agent_on_pr` times out.
- Deduplicating findings across repeated runs of the same agent in `get_findings` (see Risks).
- Remote/HTTP (Streamable HTTP) transport, auth or OAuth. This is a local stdio server only.
- A CI workflow for the new package (`.github/workflows/*`).
- Committing a repo-root `.mcp.json` / Claude Desktop config. Setup is documented in the package README only.
- Edits to `docs/architecture.md`, `README.md`, the `pr-self-review` or `engineering-insights` skills (see Risks).
**Sources read:** `CLAUDE.md`, `INSIGHTS.md`, `README.md:80-93`, `docs/architecture.md:1-39`, `specs/review-flow.md` (R2/R3), `TESTING.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`, `e2e/package.json`, `e2e/tsconfig.json`, `reviewer-core/package.json`, `reviewer-core/tsconfig.json`, `server/package.json` (zod/ts versions), `.gitignore`, `client/src/lib/api.ts`, `server/src/modules/index.ts`, `server/src/modules/_shared/{context,schemas}.ts`, `server/src/modules/agents/routes.ts:70-84`, `server/src/modules/reviews/{routes.ts,service.ts:43-174,run-executor.ts:245-280,repository.ts:67-97}`, `server/src/modules/conventions/{routes.ts:1-48,service.ts:72-76}`, `server/src/modules/repo-intel/{service.ts:220,types.ts:53,147}`, `server/src/vendor/shared/index.ts`, `server/src/vendor/shared/contracts/{review-api.ts:15-57,trace.ts:95-122,platform.ts:159-183,268-290,knowledge.ts:176-192,findings.ts:1-76 (Verdict at :39),conventions.ts:1-82,brief.ts:1-44}`, client UI pages used in error hints: `client/src/app/agents/page.tsx`, `client/src/app/settings/[section]/page.tsx` (API keys section), `client/src/app/repos/[repoId]/pulls/page.tsx`, `client/src/app/repos/[repoId]/conventions/page.tsx`, `.claude/skills/pr-self-review/SKILL.md` (Step 2 map), `docs/plans/2026-09-28-l03-smart-diff.md` (format).

## Context

**What exists today (verified)**

| Tool | Endpoint | Where | Returns |
|---|---|---|---|
| `list_agents` | `GET /agents` | `server/src/modules/agents/routes.ts:74-77` → `AgentsService.list(workspaceId)` | `Agent[]`, see `server/src/vendor/shared/contracts/knowledge.ts:176-192` (`id, name, description, provider, model, system_prompt, output_schema, enabled, version, strategy, ci_fail_on, repo_intel`) |
| `run_agent_on_pr` (trigger) | `POST /pulls/:id/review`, body `RunRequest` `{ agentId?, all? }` (`platform.ts:276-280`) | `server/src/modules/reviews/routes.ts:27-44`, rate limit **10/min** (`:29`) | `ReviewRunResponse` `{ pr_id, runs: ReviewRunTarget[], reviews }` (`review-api.ts:45-57`). `reviews` is **always `[]`**: `service.ts:131-137` creates the `agent_runs` rows, then fires the executor and forgets it |
| `run_agent_on_pr` (poll) | `GET /pulls/:id/runs` | `reviews/routes.ts:101-104` → `repository.ts:85` | `RunSummary[]` (`trace.ts:99-122`). `status` is `z.string().nullable()` with the comment `running \| done \| failed \| cancelled` (`trace.ts:105`, invariant R2 in `specs/review-flow.md:42`). R3: failed and cancelled runs keep their `error` text |
| `get_findings` | `GET /pulls/:id/reviews` | `reviews/routes.ts:129-132` → `service.ts:160-174`. Returns **404 `Pull request not found`** for an unknown PR (`:162`) | `ReviewRecord[]` (`review-api.ts:23-38`). Each has `id`, `run_id`, `agent_id`, `agent_name`, `verdict` (`Verdict` = `request_changes \| approve \| comment`, nullable, `findings.ts:39`), `score` (int, nullable), `summary` and `findings: FindingRecord[]`. `FindingRecord` = `Finding` + `review_id, accepted_at, dismissed_at` (`review-api.ts:15-20`). Base `Finding` is at `findings.ts:60-76`. There is no findings-by-run endpoint |
| `get_conventions` | `GET /repos/:id/conventions` | `server/src/modules/conventions/routes.ts:45-48` → `service.ts:72-76` (`requireRepo` → 404 on an unknown repo) | `Convention[]` (`conventions.ts:70-82`: `id, repo_id, category, rule, rationale, evidence, confidence, status, origin, created_at`). Enums: `ConventionCategory` (`:27-39`), `ConventionStatus` (`:48`), `ConventionOrigin` (`:57`) |
| `get_blast_radius` | **none** | `server/src/modules/index.ts:29-42` registers no blast module. The facade `getBlastRadius(repoId, changedFiles)` exists only in-process (`repo-intel/service.ts:220`, `types.ts:147`) | Mock shaped as `BlastRadius` (`brief.ts:17-44`). The same shape exists in `client/src/vendor/shared/contracts/brief.ts:39-44` |

**Facts the design depends on**
- **Every `:id` route param is a uuid.** `IdParams = z.object({ id: z.string().uuid() })` (`server/src/modules/_shared/schemas.ts:11`). A non-uuid id gets a **422** before the handler runs.
- **No auth header is needed.** `getContext` resolves the default workspace through `LocalNoAuthProvider` (`_shared/context.ts:9-23`). The web client sends no auth either (`client/src/lib/api.ts:21-33`).
- **Error envelope:** `{ error: { code, message, details } }` (`server/CLAUDE.md` "Non-default conventions"). `client/src/lib/api.ts:44-58` is the reference parser, and `status 0 / code "network_error"` is its "API unreachable" convention.
- **A `done` status implies the review is already persisted.** `run-executor.ts:249-260` inserts the review and findings (carrying `runId`, `:253`) *before* `completeAgentRun(..., { status: 'done' })` at `:274-275`. So one `GET /pulls/:id/reviews` after all runs are terminal is enough: no second wait, no race. It also means each `done` run has exactly one `ReviewRecord` with a matching `run_id`, which is where `run_agent_on_pr` reads `verdict` and `score` from.
- **No agent default.** `resolveTargets` throws 400 `invalid_run_request` without `agentId` or `all:true` (`reviews/service.ts:56`). An unknown agent gets 404 `Agent not found` (`:53`).
- **`PrMeta` has no `repo_id` field** (`platform.ts:159-183`). This corrects the request's premise: a caller holding only a PR id has no contract-level way to get its repo id from the PR payload. `get_conventions` therefore takes `repo_id` directly. Repo ids come from `GET /repos` (`server/src/modules/repos/routes.ts:33`). The PR uuid is globally unique, so `run_agent_on_pr` does **not** need a `repo_id` argument (unlike the slide's `run_agent_on_pr(repo, pr, agent)` example).
- **No MCP tool lists repos or PRs.** An MCP caller that has a bad PR/repo id therefore cannot look one up with a tool. Error hints for those ids point at the user and the DevDigest UI pages that do exist: `client/src/app/repos/[repoId]/pulls/page.tsx`, `client/src/app/repos/[repoId]/conventions/page.tsx`, `client/src/app/agents/page.tsx`, and the API-keys section of `client/src/app/settings/[section]/page.tsx`.
- **Package pattern to copy:** `reviewer-core/tsconfig.json:21-26` maps `@devdigest/shared` to `../server/src/vendor/shared/index.ts` and maps `zod` to its **own** `node_modules`. `reviewer-core/package.json:9` makes `build` a type-check only. Root `.gitignore` already ignores `node_modules/` and `dist/`.

**What is missing:** the whole `devdigest-mcp/` package. No MCP SDK is installed anywhere in the repo (no `@modelcontextprotocol` in any `*/package.json`).

**Scaffolding consumed rather than created:** the `BlastRadius`/`ChangedSymbol`/`DownstreamImpact`/`BlastCaller` contracts (`brief.ts`) serve as the mock's type. Every other response type is reused from `@devdigest/shared` as-is. No parallel type definitions.

### Design principles (bind every tool)
1. **Result, not operation.** A tool returns the outcome the caller wants, not a handle to poll. `run_agent_on_pr` creates the run(s), waits for them, and collects the findings in one call, so the model never orchestrates trigger → poll → fetch itself.
2. **Flat arguments.** Every input is a top-level scalar (`string`, `number`, `boolean`, enum) or an array of scalars; ids are separate named scalars (`pr_id`, `agent_id`, `run_id`, `repo_id`). No nested objects. Models, especially non-Anthropic ones, make more mistakes filling nested-object arguments.
3. **Concise structured response.** The default (`response_format: "concise"`) is the smallest useful answer: a verdict plus the findings, with only the fields a caller acts on. Run bookkeeping, ids nothing consumes, and long text sit behind `"detailed"`. A raw dump can easily burn tens of thousands of tokens.
4. **Error leads onward.** Every error or empty result names the next concrete tool call or action ("Agent X not found — call list_agents"), never a bare "404", so the caller has a next step instead of getting stuck.

**Audit of the tool inputs against principle 2** (Steps 6, 7, 9, 10, 11 re-read): every field is a scalar, an enum, or an array of scalars. Nothing is nested:

| Tool | Inputs | Non-scalar fields |
|---|---|---|
| `list_agents` | `enabled_only: boolean`, `response_format: enum` | none |
| `get_findings` | `pr_id`, `run_id?`, `agent_id?`: string · `severity?: enum[]` · `include_dismissed: boolean` · `limit`, `offset`: int · `response_format` | `severity` is an array of enum strings (allowed) |
| `run_agent_on_pr` | `pr_id`, `agent_id?`: string · `all_agents?: boolean` · `timeout_seconds?`, `max_findings`: int · `response_format` | none |
| `get_conventions` | `repo_id`: string · `status?`, `category?`: enum · `limit`, `offset`: int · `response_format` | none |
| `get_blast_radius` | `pr_id`: string · `changed_files?: string[]` | `changed_files` is an array of strings (allowed) |

No step changes shape because of this audit. `FindingFilter` in Step 7 is an internal type, not a tool input. The rule becomes invariant **M9** in Step 13, so a future tool can't quietly add a nested input.

### Key design decisions (expensive to reverse)
1. **`@devdigest/shared` is imported with `import type` only, never as a runtime value.** Two reasons:
   - A runtime import of the server copy would resolve its `zod` from `server/node_modules`. That couples the MCP process to the server's install.
   - It would also put a second zod instance next to the one the MCP SDK converts to JSON Schema, which is a known source of broken schema conversion.
   `verbatimModuleSyntax: true` in the tsconfig guarantees these imports are erased. Enum literals that tool inputs need (Severity, ConventionStatus, ConventionCategory) are re-declared locally, with a compile-time exhaustiveness check against the shared types, so drift fails `pnpm typecheck` (Step 3).
2. **Runs on `tsx` with no emit.** `build` = `tsc --noEmit`, the same as reviewer-core. The package never produces JS.
3. **One text block of compact JSON per tool result** (`JSON.stringify(payload)`, no indentation), with `response_format: "concise" | "detailed"` defaulting to `"concise"`.
4. **Errors come back as `{ isError: true, content: [{type:"text", text}] }` results, never thrown.** Every message follows principle 4: `"<what failed> — <next tool call or action>"` (Step 5 table).
5. **stdout belongs to the JSON-RPC stream.** All logging goes to `console.error` (stderr). A single `console.log` corrupts the protocol.
6. **`run_agent_on_pr` is one blocking call: trigger → poll → collect (principle 1, "result, not operation").** It creates the run(s) (`POST /pulls/:id/review`), waits on `GET /pulls/:id/runs` until every run is terminal (Step 8), then reads the findings once (`GET /pulls/:id/reviews`). There is deliberately no "start run" or "check status" tool. If the wait is cut short, the error points at `get_findings` as the way to collect later.
7. **`run_agent_on_pr` concise output is verdict + findings, and its shape follows the input mode, not the run count (principle 3).** `agent_id` → `{ pr_id, agent_name, verdict, score, findings }`. `all_agents` → `{ pr_id, results: [{ agent_name, verdict, score, findings_count }], findings }`. With `all_agents`, each agent's verdict is shown on its own. The tool never invents a combined verdict when agents disagree. `all_agents` with one enabled agent still returns the `results[]` shape, so a caller can rely on the shape from its own arguments. Run bookkeeping (`runs[]`: run_id, status, error, duration, cost) and full review summaries are `"detailed"` only.

Rationale sources:
- Anthropic, "Writing effective tools for agents": use terse, semantic descriptions and field names, a `response_format` concise/detailed switch, filtering and pagination with sensible defaults, and actionable error messages.
- The reference slide supplied with the request (four principles above, translated from Ukrainian).
- MCP specification, *Tools* section: report tool-execution errors inside the result with `isError: true`, not as protocol errors, so the model can see them and self-correct.
- MCP specification: stdio transport for local servers, and the authorization spec does not apply to stdio.

## Steps

### Step 1 — Scaffold the package manifest and compiler config  ·  [backend]
- **Files:** `devdigest-mcp/package.json` (new) · `devdigest-mcp/tsconfig.json` (new) · `devdigest-mcp/vitest.config.ts` (new)
- **Layer:** n/a (package infrastructure)
- **Interfaces:**
  - `package.json`:
    ```json
    {
      "name": "@devdigest/mcp",
      "version": "0.0.0",
      "private": true,
      "type": "module",
      "description": "DevDigest MCP server (stdio) — exposes agents, PR review runs, findings, conventions and a mock blast radius to MCP clients. Pure HTTP client of the API on :3001; never imports server code.",
      "bin": { "devdigest-mcp": "./src/index.ts" },
      "scripts": {
        "start": "tsx src/index.ts",
        "dev": "tsx watch src/index.ts",
        "typecheck": "tsc --noEmit -p tsconfig.json",
        "build": "tsc --noEmit -p tsconfig.json",
        "test": "vitest run",
        "inspect": "npx @modelcontextprotocol/inspector tsx src/index.ts"
      },
      "dependencies": { "@modelcontextprotocol/sdk": "^1.x (latest 1.x at install time)", "zod": "^3.25.0" },
      "devDependencies": { "@types/node": "^22.10.0", "tsx": "^4.19.2", "typescript": "^5.7.2", "vitest": "^2.1.8" }
    }
    ```
    Install with `pnpm add @modelcontextprotocol/sdk zod@^3.25` so the lock records a concrete SDK version. Do not write `"^1.x"` literally. Before settling the zod range, check the SDK's `peerDependencies.zod`. If it requires zod 4, take zod 4 and note it in `devdigest-mcp/INSIGHTS.md`. Drop the `bin` field if `tsx` shebang handling fails on Windows; it is a convenience only.
  - `tsconfig.json`: copy `reviewer-core/tsconfig.json` verbatim, with these changes:
    - set `"verbatimModuleSyntax": true`
    - set `"include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]`
    - keep `paths`: `"@devdigest/shared": ["../server/src/vendor/shared/index.ts"]`, `"@devdigest/shared/*": ["../server/src/vendor/shared/*"]`, `"zod": ["./node_modules/zod"]`, `"zod/*": ["./node_modules/zod/*"]`

    Point at the **server** copy: it is the one ahead (root `INSIGHTS.md:22`), and it is what the API actually serializes.
  - `vitest.config.ts`: `defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } })`.
- **Skills to invoke:** `typescript-expert`
- **Depends on:** nothing
- **Done when:** `cd devdigest-mcp && pnpm install && pnpm typecheck` succeeds. With an empty `src/index.ts` stub, `import type { Agent } from '@devdigest/shared'` type-checks.

### Step 2 — Config loader  ·  [backend]
- **Files:** `devdigest-mcp/src/config.ts` (new)
- **Layer:** infrastructure (process env → typed config)
- **Interfaces:**
  ```ts
  export interface McpConfig {
    apiBase: string;              // no trailing slash
    requestTimeoutMs: number;     // per HTTP call
    pollIntervalMs: number;       // run_agent_on_pr poll cadence
    defaultRunTimeoutMs: number;  // run_agent_on_pr overall wait when caller omits timeout_seconds
  }
  export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig;
  ```
  | Env var | Default | Rule |
  |---|---|---|
  | `DEVDIGEST_API_BASE` | `http://localhost:3001` | Must parse with `new URL()`, and protocol must be `http:` or `https:`. Otherwise throw at startup with a clear message. Strip the trailing `/`. |
  | `DEVDIGEST_MCP_REQUEST_TIMEOUT_MS` | `15000` | int, clamp 1000–120000 |
  | `DEVDIGEST_MCP_POLL_INTERVAL_MS` | `3000` | int, clamp 500–30000 |
  | `DEVDIGEST_MCP_RUN_TIMEOUT_MS` | `300000` | int, clamp 30000–900000 |

  Parse with a local Zod schema (`z.coerce.number().int()` plus clamping), which is safe for env strings. There are **no secrets**: the API needs no key, and provider keys stay with the server (`~/.devdigest/secrets.json`). The base URL comes only from env, never from tool input, so no tool argument can redirect requests (no SSRF surface).
- **Skills to invoke:** `zod`, `security`, `typescript-expert`
- **Depends on:** Step 1
- **Done when:** `test/config.test.ts` covers three cases:
  - defaults
  - a clamped out-of-range value
  - a thrown error for `DEVDIGEST_API_BASE=ftp://x`

### Step 3 — Local enum literals with drift guard  ·  [backend]
- **Files:** `devdigest-mcp/src/tools/enums.ts` (new)
- **Layer:** domain (pure literals)
- **Interfaces:**
  ```ts
  import type { Severity, ConventionStatus, ConventionCategory } from '@devdigest/shared';
  export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const satisfies readonly Severity[];
  export const CONVENTION_STATUSES = ['pending', 'accepted', 'rejected'] as const satisfies readonly ConventionStatus[];
  export const CONVENTION_CATEGORIES = ['naming','structure','error_handling','async','typing','imports','testing','api','logging','security','formatting'] as const satisfies readonly ConventionCategory[];
  export const RESPONSE_FORMATS = ['concise', 'detailed'] as const;
  export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];
  export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
  // exhaustiveness: fails to compile if shared adds a member we don't list
  type Exhaustive<All, Listed> = [Exclude<All, Listed>] extends [never] ? true : never;
  const _sev: Exhaustive<Severity, (typeof SEVERITIES)[number]> = true;
  const _st: Exhaustive<ConventionStatus, (typeof CONVENTION_STATUSES)[number]> = true;
  const _cat: Exhaustive<ConventionCategory, (typeof CONVENTION_CATEGORIES)[number]> = true;
  ```
  Values are from `findings.ts:11` and `conventions.ts:27-39,48`. Severity stays UPPERCASE across the boundary (root `INSIGHTS.md:36`).
- **Skills to invoke:** `typescript-expert`, `zod`
- **Depends on:** Step 1
- **Done when:** `pnpm typecheck` passes. Temporarily deleting `'SUGGESTION'` from `SEVERITIES` makes typecheck fail (check this by hand, then revert).

### Step 4 — HTTP client and typed endpoint wrappers  ·  [backend]
- **Files:** `devdigest-mcp/src/api/client.ts` (new) · `devdigest-mcp/src/api/endpoints.ts` (new)
- **Layer:** infrastructure (the only file that calls `fetch`)
- **Interfaces:**
  ```ts
  // client.ts
  export class DevDigestApiError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string, readonly details?: unknown);
  }
  export interface HttpClient {
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
  }
  export function createHttpClient(cfg: Pick<McpConfig, 'apiBase' | 'requestTimeoutMs'>, fetchImpl: typeof fetch = fetch): HttpClient;
  ```
  - Port the behaviour of `client/src/lib/api.ts:21-63`; do not import it.
  - Send `content-type: application/json` **only when a body is sent** (Fastify rejects an empty JSON body, see the comment at `api.ts:27-29`).
  - Use `AbortSignal.timeout(requestTimeoutMs)`.
  - A network failure or timeout → `DevDigestApiError('DevDigest API unreachable at <apiBase> — start it with ./scripts/dev.sh, then retry.', 0, 'network_error')`.
  - A non-2xx response → parse the `{ error: { code, message, details } }` envelope, falling back to `"<status> <statusText>"`.
  - 204 → `undefined`.
  - Never include response bodies of non-API hosts in messages.
  ```ts
  // endpoints.ts — thin, typed, one function per route; types are `import type` from @devdigest/shared
  import type { Agent, ReviewRunResponse, RunSummary, ReviewRecord, Convention, RunRequest } from '@devdigest/shared';
  export interface DevDigestApi {
    listAgents(): Promise<Agent[]>;                                        // GET  /agents
    triggerReview(prId: string, body: RunRequest): Promise<ReviewRunResponse>; // POST /pulls/:id/review
    listRuns(prId: string): Promise<RunSummary[]>;                         // GET  /pulls/:id/runs
    listReviews(prId: string): Promise<ReviewRecord[]>;                    // GET  /pulls/:id/reviews
    listConventions(repoId: string): Promise<Convention[]>;                // GET  /repos/:id/conventions
  }
  export function createDevDigestApi(http: HttpClient): DevDigestApi;
  ```
  - Path segments go through `encodeURIComponent`.
  - Responses are cast, not re-parsed. The API is local and trusted, and it serializes with the same Zod schemas (see Risks).
- **Skills to invoke:** `security`, `typescript-expert`
- **Depends on:** Steps 1, 2
- **Done when:** `test/api-client.test.ts` passes, using an injected `fetchImpl` stub with no real network. It covers:
  - (a) a 404 envelope → `DevDigestApiError{status:404, code, message}`
  - (b) a rejected fetch → `status 0, code 'network_error'`, message contains `./scripts/dev.sh`
  - (c) POST with a body sets `content-type`, and GET without a body does not
  - (d) a 422 non-JSON body falls back to `"422 ..."`

### Step 5 — Shared tool-result helpers  ·  [backend]
- **Files:** `devdigest-mcp/src/tools/result.ts` (new) · `devdigest-mcp/src/tools/types.ts` (new)
- **Layer:** application (tool plumbing)
- **Interfaces:**
  ```ts
  // types.ts
  export interface ToolDeps {
    api: DevDigestApi;
    config: McpConfig;
    sleep: (ms: number, signal?: AbortSignal) => Promise<void>; // injectable for tests
    now: () => number;                                           // injectable for tests
  }
  // result.ts  (CallToolResult from '@modelcontextprotocol/sdk/types.js')
  export function ok(payload: unknown): CallToolResult;           // { content:[{type:'text', text: JSON.stringify(payload)}] }
  export function toolError(message: string, extra?: unknown): CallToolResult; // { isError:true, content:[{type:'text', text: message + (extra ? '\n' + JSON.stringify(extra) : '')}] }
  export function fromApiError(e: unknown, ctx: { entity: 'pull request' | 'repo' | 'agent'; id: string }): CallToolResult;
  export function paginate<T>(items: T[], offset: number, limit: number): { page: T[]; total: number; next_offset: number | null };
  export const responseFormatParam: z.ZodDefault<z.ZodEnum<...>>; // z.enum(RESPONSE_FORMATS).default('concise').describe('concise (default): verdict + findings, minimal fields; detailed: adds ids, run bookkeeping and long text')
  // Principle-4 id hints, reused by fromApiError AND by the input schemas' custom zod messages (Steps 6–11):
  export const ID_HINTS: Record<'pull request' | 'repo' | 'agent', string>;
  ```
  **`ID_HINTS`** (the "next step" half of every id error):

  | Entity | Hint text |
  |---|---|
  | `agent` | `call list_agents and use an agent's id as agent_id` |
  | `pull request` | `pr_id must be the DevDigest PR uuid, not the GitHub PR number — ask the user for it (DevDigest UI: Repos → Pull requests)` |
  | `repo` | `repo_id must be the DevDigest repo uuid (a PR id will not work) — ask the user for it (DevDigest UI: Repos)` |

  There is no MCP tool that lists repos or PRs (see Context), so for those two entities "ask the user" is the concrete next step. Do not tell the model to call an HTTP route it has no tool for.

  **`fromApiError` message table.** Every row has the form `"<what failed> — <next step>"`, and the id is always echoed:

  | Condition | Message |
  |---|---|
  | `status 0` | the network message from Step 4 (`DevDigest API unreachable at <apiBase> — start it with ./scripts/dev.sh, then retry.`) |
  | `404` | `"<Entity> <id> not found — " + ID_HINTS[entity] + "."`, e.g. `Agent 1b2… not found — call list_agents and use an agent's id as agent_id.` |
  | `422` | `"<id> is not a valid DevDigest <entity> id — " + ID_HINTS[entity] + "."` |
  | `429` | `"DevDigest rate limit hit (review runs are capped at 10/minute) — wait about 60s, then retry run_agent_on_pr with the same arguments."` |
  | `400` with `code==='invalid_run_request'` | `"Invalid run request — pass exactly one of agent_id (from list_agents) or all_agents:true."` |
  | other `4xx` | `"DevDigest API rejected the request (<status> <code>: <message>) — check the arguments against this tool's input schema and retry."` |
  | `5xx` | `"DevDigest API failed (<status> <code>: <message>) — retry once; if it repeats, tell the user to check the API log in the ./scripts/dev.sh terminal."` |

  Unknown non-`DevDigestApiError` errors → `toolError("Unexpected devdigest-mcp error: <message> — retry once; if it repeats, stop and report it to the user.")`. **Never rethrow from a handler.**
- **Skills to invoke:** `typescript-expert`, `zod`
- **Depends on:** Steps 3, 4
- **Done when:** the unit tests in `test/result.test.ts` pass. They cover:
  - every row of the table, each asserting the message contains ` — ` followed by a non-empty next step
  - the 404 agent row contains `list_agents`, and the 404 pull-request row contains `not the GitHub PR number`
  - `paginate` bounds: `next_offset` is `null` on the last page, and an offset past the end gives an empty page

### Step 6 — `list_agents` tool  ·  [backend]
- **Files:** `devdigest-mcp/src/tools/list-agents.ts` (new)
- **Layer:** application
- **Interfaces:**
  ```ts
  export const listAgentsInput = {
    enabled_only: z.boolean().default(false).describe('Only agents that run in "all agents" mode'),
    response_format: responseFormatParam,
  };
  export async function listAgentsHandler(args: { enabled_only: boolean; response_format: ResponseFormat }, deps: ToolDeps): Promise<CallToolResult>;
  export function registerListAgents(server: McpServer, deps: ToolDeps): void;
  ```
  - Description (terse): `"List DevDigest review agents. Use an agent's id as agent_id in run_agent_on_pr."`
  - Output, concise: `{ agents: [{ id, name, description, provider, model, enabled }] }`. Detailed: the full `Agent` objects. (Principle-3 check: `id` stays in concise because `run_agent_on_pr` consumes it, and `enabled` tells the caller what `all_agents` will run.)
  - Not paginated. The agent count is small and the concise projection is the token control.
  - **Errors / empty (principle 4):**
    - Network → `fromApiError` (the `./scripts/dev.sh` message).
    - Zero agents → `ok({ agents: [], note: "No agents configured — ask the user to create one in the DevDigest UI (Agents page)." })`.
    - `enabled_only:true` filters everything out → `ok({ agents: [], note: "No enabled agents — call list_agents without enabled_only and pass one as agent_id to run_agent_on_pr." })`.
- **Skills to invoke:** `zod`, `typescript-expert`
- **Depends on:** Step 5
- **Done when:** `test/list-agents.test.ts` passes, using a fake `DevDigestApi`. It checks that concise omits `system_prompt` and `output_schema`, that detailed includes them, that `enabled_only` filters (and the "No enabled agents" note appears when it filters to zero), and that a network error gives `isError: true`.

### Step 7 — `get_findings` tool and the finding projection  ·  [backend]
- **Files:** `devdigest-mcp/src/tools/get-findings.ts` (new)
- **Layer:** application
- **Interfaces:**
  ```ts
  export const getFindingsInput = {
    pr_id: z.string().uuid({ message: `pr_id: ${ID_HINTS['pull request']}` }).describe('DevDigest pull-request id (uuid, not the GitHub PR number)'),
    run_id: z.string().min(1).optional().describe('Only findings from this review run'),
    agent_id: z.string().min(1).optional().describe('Only findings from this agent (id from list_agents)'),
    severity: z.array(z.enum(SEVERITIES)).min(1).optional().describe('e.g. ["CRITICAL","WARNING"]'),
    include_dismissed: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
    response_format: responseFormatParam,
  };
  export interface FindingFilter { runIds?: string[]; agentId?: string; severity?: Severity[]; includeDismissed: boolean }
  export type FindingOmit = 'agent_name' | 'run_id';
  export function selectFindings(reviews: ReviewRecord[], f: FindingFilter): ProjectableFinding[]; // flatten + filter + sort
  export function projectFinding(x: ProjectableFinding, format: ResponseFormat, omit?: readonly FindingOmit[]): Record<string, unknown>;
  export function summarizeReviews(reviews: ReviewRecord[], format: ResponseFormat): Record<string, unknown>[];
  export function countKeptFindings(review: ReviewRecord): number; // findings with dismissed_at === null
  export async function getFindingsHandler(args, deps: ToolDeps): Promise<CallToolResult>;
  export function registerGetFindings(server: McpServer, deps: ToolDeps): void;
  ```
  `ProjectableFinding` = `FindingRecord & { run_id: string | null; agent_name: string | null | undefined }`, copied down from the parent `ReviewRecord`. `projectFinding`'s `omit` only applies to `concise`; `detailed` always keeps every field. `run_agent_on_pr` (Step 9) uses `omit` to drop fields its top level already states.

  **Selection:**
  - Flatten `reviews[].findings`.
  - Filter by `run_id` (the review's run), `agent_id` (the review's agent) and `severity`.
  - Unless `include_dismissed` is set, drop findings where `dismissed_at !== null`.
  - Sort by `SEVERITY_RANK`, then `file`, then `start_line`.

  **Projection (tightened for principle 3):**
  - Concise: `{ severity, category, title, file, start_line, end_line, confidence, agent_name, run_id }`. The finding `id` is dropped from concise because no tool in this server takes a finding id.
  - Detailed adds `id, review_id, rationale, suggestion, kind, accepted_at, dismissed_at, trifecta_components, evidence`.

  **Review summaries:**
  - Concise, under the key `results`: `{ run_id, agent_name, verdict, score, findings_count }`, limited to reviews that passed the run/agent filter. `findings_count` = `countKeptFindings(review)`. `run_id` stays so the caller can re-query with `run_id` when one agent has reviewed the PR more than once.
  - Detailed, under the key `reviews`: `{ review_id, run_id, agent_name, verdict, score, findings_count, created_at, summary, model, grounding }`.

  **Output:**
  - Concise: `{ pr_id, results: [...], total, next_offset, findings: [...] }`. `offset` is not echoed, since the caller sent it.
  - Detailed: `{ pr_id, reviews: [...], total, offset, next_offset, findings: [...] }`.

  **Empty and error cases (principle 4):**
  - No reviews at all → `ok({ pr_id, results: [], total: 0, next_offset: null, findings: [], note: "No reviews yet for this PR — call run_agent_on_pr with this pr_id and an agent_id from list_agents." })`. This is not an error.
  - Reviews exist but the filters leave zero findings → `ok` with `findings: []` and `note: "No findings match these filters (<n> findings on this PR without them) — drop severity/run_id/agent_id or set include_dismissed:true."`. If `run_id` matched no review at all, the note is instead `"No review for run_id <id> on this PR — omit run_id, or use a run_id from results."`, with `results` computed without the `run_id` filter.
  - A PR that does not exist → a 404 from the API → `fromApiError(entity:'pull request')`, which carries the "not the GitHub PR number — ask the user" hint.

  Description: `"Findings from DevDigest reviews of a PR, most severe first. Filter by run, agent or severity; paginate with offset/limit."`
- **Skills to invoke:** `zod`, `typescript-expert`
- **Depends on:** Step 5
- **Done when:** `test/get-findings.test.ts` passes with a fixture of 2 reviews and about 6 findings. It checks:
  - sort order
  - each filter
  - that dismissed findings are hidden by default
  - pagination `next_offset`
  - concise payload keys are exactly `pr_id, results, total, next_offset, findings` (no `reviews`, no `offset`). Concise findings have no `id` and no `rationale`. Concise `results[]` items are exactly `run_id, agent_name, verdict, score, findings_count`.
  - detailed payload has `reviews[]` with `summary` and `created_at`, and findings with `id` and `rationale`
  - `projectFinding(x, 'concise', ['agent_name','run_id'])` drops both keys, and the same call with `'detailed'` keeps them
  - the zero-reviews note mentions `run_agent_on_pr`, and the filtered-to-zero note mentions `include_dismissed`
  - that a 404 gives `isError` with a "not the GitHub PR number" hint

### Step 8 — Run poller  ·  [backend]
- **Files:** `devdigest-mcp/src/tools/wait-for-runs.ts` (new)
- **Layer:** application
- **Interfaces:**
  ```ts
  export type RunOutcome = { run_id: string; agent_name: string; status: 'done' | 'failed' | 'cancelled' | 'running' | 'missing'; summary?: RunSummary };
  export type WaitResult =
    | { kind: 'settled'; runs: RunOutcome[] }                 // every target is done|failed|cancelled
    | { kind: 'timeout'; runs: RunOutcome[]; waitedMs: number }
    | { kind: 'aborted'; runs: RunOutcome[] }
    | { kind: 'missing'; runs: RunOutcome[] }                 // a triggered run_id vanished from /runs
    | { kind: 'poll_failed'; runs: RunOutcome[]; error: unknown };
  export async function waitForRuns(opts: {
    prId: string;
    targets: { run_id: string; agent_name: string }[];
    timeoutMs: number;
    deps: ToolDeps;
    signal?: AbortSignal;
    onProgress?: (finished: number, total: number) => Promise<void> | void;
  }): Promise<WaitResult>;
  ```
  **Polling strategy (exact):**
  1. `deadline = deps.now() + timeoutMs`.
  2. Loop:
     - `await deps.sleep(config.pollIntervalMs, signal)`. The first poll comes one interval after the trigger, since a review never finishes in under a second.
     - `api.listRuns(prId)`.
  3. Index the response by `run_id`, then classify each target:
     - `status === 'done'` → terminal success.
     - `'failed'` or `'cancelled'` → terminal failure. Keep `summary.error` (R3, `specs/review-flow.md:43`).
     - `'running'`, `null`, or any other string → pending.
     - Absent from the list → `missing`. The rows are created synchronously before the POST responds (`reviews/service.ts:114-129`), so absence means the run was deleted. Return `{kind:'missing'}` immediately.
  4. If every target is terminal → return `settled`.
  5. Otherwise call `onProgress(terminalCount, targets.length)`.
  6. Transient poll errors are `DevDigestApiError` with `status 0` or `>= 500`. Tolerate **3 consecutive** ones, resetting the count on success; on the 4th return `poll_failed`. Return any 4xx at once as `poll_failed` (for example, the PR was deleted).
  7. If `deps.now() >= deadline` → return `timeout` with the current classifications.
  8. If `signal.aborted` (the client cancelled the request) → return `aborted`. `deps.sleep` must reject or resolve early on abort.
- **Skills to invoke:** `typescript-expert`
- **Depends on:** Steps 4, 5
- **Done when:** `test/wait-for-runs.test.ts` passes with fake `sleep`/`now`, so no real timers run. It covers:
  - running→done settles after N polls
  - one failed + one done settles with both statuses
  - timeout
  - missing run
  - 3 transient errors then success keeps polling, and 4 in a row → `poll_failed`
  - abort
  - `onProgress` called with the right counts

### Step 9 — `run_agent_on_pr` tool  ·  [backend]
- **Files:** `devdigest-mcp/src/tools/run-agent-on-pr.ts` (new)
- **Layer:** application
- **Principle 1 — result, not operation.** This tool is the reason principle 1 exists. One call performs all three steps: **(a) create** the run(s) with `POST /pulls/:id/review`, **(b) wait** on `GET /pulls/:id/runs` through `waitForRuns` (Step 8), and **(c) collect** the findings with one `GET /pulls/:id/reviews`. It returns the verdict and findings, not a run id to poll. Do not split it into start/status tools.
- **Interfaces:**
  ```ts
  export const runAgentOnPrInput = {
    pr_id: z.string().uuid({ message: `pr_id: ${ID_HINTS['pull request']}` }).describe('DevDigest pull-request id (uuid, not the GitHub PR number)'),
    agent_id: z.string().min(1, { message: `agent_id: ${ID_HINTS.agent}` }).optional().describe('Agent to run (from list_agents). Exactly one of agent_id / all_agents.'),
    all_agents: z.boolean().optional().describe('Run every enabled agent instead of one'),
    timeout_seconds: z.number().int().min(30).max(900).optional().describe('Max wait for the review(s); default 300'),
    max_findings: z.number().int().min(1).max(100).default(50),
    response_format: responseFormatParam,
  };
  export async function runAgentOnPrHandler(args, deps: ToolDeps, extra: RequestHandlerExtra): Promise<CallToolResult>;
  export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void;
  // local, pure helpers (exported for tests)
  export function buildSinglePayload(prId: string, run: RunOutcome, review: ReviewRecord | undefined, findings: ProjectableFinding[], total: number, maxFindings: number, format: ResponseFormat): Record<string, unknown>;
  export function buildMultiPayload(prId: string, runs: RunOutcome[], reviews: ReviewRecord[], findings: ProjectableFinding[], total: number, maxFindings: number, format: ResponseFormat): Record<string, unknown>;
  ```
  All inputs are flat scalars (principle 2). `repo_id` is not an input, because the PR uuid already identifies the repo server-side.

  **Flow:**
  1. **Validate the mode in the handler.** A raw-shape `inputSchema` cannot carry a cross-field `.refine`. Exactly one of `agent_id` / `all_agents === true` must be set; otherwise → `toolError('Pass exactly one of agent_id (call list_agents to get one) or all_agents:true.')`. There is no implicit default agent (`reviews/service.ts:56`). Record the mode: `mode = agent_id ? 'single' : 'multi'`.
  2. **(a) Create.** `api.triggerReview(pr_id, agent_id ? { agentId: agent_id } : { all: true })`. On error → `fromApiError` (`entity: 'agent'`, `id: agent_id` when a 404 message mentions "Agent"; otherwise `entity: 'pull request'`, `id: pr_id`). If `runs.length === 0` (multi mode, no enabled agents) → `toolError('No enabled agents — pass agent_id (any agent from list_agents), or ask the user to enable one on the DevDigest Agents page.')`.
  3. **(b) Wait.** `waitForRuns({ timeoutMs: (timeout_seconds ?? config.defaultRunTimeoutMs/1000) * 1000, signal: extra.signal, onProgress })`. If `extra._meta?.progressToken` is present, `onProgress` sends `notifications/progress` `{ progressToken, progress: finished, total, message: "<finished>/<total> review runs finished" }` through `extra.sendNotification`. This keeps clients that reset the timeout on progress from giving up during a long review.
  4. **(c) Collect.** On `settled`, with at least one `done` run: one `api.listReviews(pr_id)`, then `selectFindings(reviews, { runIds: doneRunIds, includeDismissed: false })` and `paginate(…, 0, max_findings)` from Step 7. The review for a run is `reviews.find(r => r.run_id === run.run_id)`. There is exactly one per `done` run (Context), so `undefined` only happens if that invariant breaks; then `verdict`/`score` are `null`.
  5. **Result payload (principle 3).** Shape depends on `mode` and `response_format`, never on how many runs came back:

     | | `concise` (default) | `detailed` |
     |---|---|---|
     | **single** (`agent_id`) | `{ pr_id, agent_name, verdict, score, findings }` | `{ pr_id, runs: [RunLine], reviews: summarizeReviews(…,'detailed'), total_findings, truncated, findings }` |
     | **multi** (`all_agents`) | `{ pr_id, results: [ResultLine], findings }` | same as the single detailed row |

     - `verdict`, `score`: from that run's `ReviewRecord` (`review-api.ts:30,32`), passed through as-is (`request_changes | approve | comment | null`, int or `null`).
     - Concise `findings` items: single → `projectFinding(x, 'concise', ['agent_name','run_id'])`, since the top level already names the agent. Multi → `projectFinding(x, 'concise', ['run_id'])`, keeping `agent_name` so each finding is attributed. Sorted by severity across all agents (Step 7 selection). Detailed items: `projectFinding(x, 'detailed')`.
     - `ResultLine` (multi concise), one per triggered run, in trigger order: a done run gives `{ agent_name, verdict, score, findings_count }`, with `findings_count = countKeptFindings(review)` counted before truncation. A failed/cancelled run gives `{ agent_name, status, error }`. **Do not compute an aggregate verdict.** When agents disagree, each one's verdict is visible in its own line.
     - `RunLine` (detailed only): `{ run_id, agent_name, status, error, duration_ms, cost_usd, findings_count, score }`.
     - **Truncation.** In concise, add `truncated: true`, `total_findings: <n>` and `next: "call get_findings with pr_id=<pr_id>` (+ ` and run_id=<id>` in single mode) `and offset=<max_findings> for the rest"` **only when** `total > max_findings`. When nothing was cut, those keys are absent. Detailed always carries `total_findings` and `truncated`.
  6. **Outcomes (principle 4: each names the next step):**
     - Every run `done` → `ok(payload)`.
     - Single mode, the run `failed`/`cancelled` → `toolError('Review run <run_id> (<agent_name>) <status>: <error> — fix the cause and retry run_agent_on_pr. If the error names a missing API key or provider, ask the user to add it in DevDigest Settings → API keys.')`. Concise attaches no payload (there are no findings). Detailed attaches `{ pr_id, runs: [RunLine] }`.
     - Multi mode, some runs `failed`/`cancelled` → `toolError('<k> of <n> review run(s) did not complete: <agent_name>: <status> — <error>; … — retry run_agent_on_pr with agent_id for each failed agent. Results from the completed runs are below.', payload)`. Here `payload` is the multi payload for the chosen format, and it keeps the findings of the `done` runs.
     - `timeout` → `toolError('Timed out after <s>s waiting for run(s) <ids>. They are still running on the server — call get_findings with pr_id=<id> (and run_id=<id>) in a minute or two.', { pr_id, run_ids })`. Do **not** cancel server runs.
     - `missing` → `toolError('Run <id> disappeared from the PR run history (deleted?) — retry run_agent_on_pr with the same arguments.')`.
     - `poll_failed` → `fromApiError(error, {entity:'pull request', id: pr_id})`.
     - `aborted` → `toolError('Cancelled by client; review run(s) <ids> continue on the server — call get_findings with pr_id=<id> later to read their findings.')`.

  Description: `"Run a DevDigest review agent on a PR and return its verdict and findings in one call (it waits, typically 30s–5min). Needs agent_id from list_agents, or all_agents:true. Rate-limited to 10 runs/min."`
- **Skills to invoke:** `zod`, `typescript-expert`, `security`
- **Depends on:** Steps 7, 8
- **Done when:** `test/run-agent-on-pr.test.ts` passes with a fake API and fake clock. It covers:
  - neither or both mode params → `isError` whose text mentions `list_agents`, with no API call made
  - **single, concise (happy path):** a fake API records trigger → ≥1 `listRuns` → exactly one `listReviews` (principle 1). The payload keys are exactly `pr_id, agent_name, verdict, score, findings`, with `verdict`/`score` equal to the triggered run's review. Findings are only those whose `run_id` was triggered (the fixture includes an older review from another run, which must be excluded), and the finding items have no `agent_name`, `run_id`, `id` or `rationale`.
  - **single, truncation:** with `max_findings: 2` and 3 findings, `truncated: true`, `total_findings: 3`, and `next` mentions `get_findings` and `offset=2`. Without truncation, those keys are absent.
  - **multi, concise, disagreeing verdicts:** fixture agents return `approve` and `request_changes`. `results` has two lines carrying each verdict, and there is no top-level `verdict` key. Findings keep `agent_name`, are sorted CRITICAL first across both agents, and have no `run_id`.
  - **multi with one enabled agent:** still returns the `results[]` shape
  - **detailed:** has `runs[]` with `duration_ms`/`cost_usd`, plus `reviews[]` with `summary`
  - single failed run → `isError` whose text carries the run's `error` and `retry run_agent_on_pr`. Multi with one failed + one done → `isError` whose attached payload has the done agent's findings and a `{ agent_name, status, error }` line for the failed one.
  - timeout → `isError` mentioning `get_findings`
  - a 429 on trigger → the rate-limit message, which mentions `retry run_agent_on_pr`
  - a 404 "Agent not found" on trigger → the message mentions `list_agents`

### Step 10 — `get_conventions` tool  ·  [backend]
- **Files:** `devdigest-mcp/src/tools/get-conventions.ts` (new)
- **Layer:** application
- **Interfaces:**
  ```ts
  export const getConventionsInput = {
    repo_id: z.string().uuid({ message: `repo_id: ${ID_HINTS.repo}` }).describe('DevDigest repo id (uuid). Conventions are per repo, not per PR.'),
    status: z.enum(CONVENTION_STATUSES).optional().describe('accepted = house rules a human approved; omit for all'),
    category: z.enum(CONVENTION_CATEGORIES).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
    response_format: responseFormatParam,
  };
  export async function getConventionsHandler(args, deps: ToolDeps): Promise<CallToolResult>;
  export function registerGetConventions(server: McpServer, deps: ToolDeps): void;
  ```
  - Filter client-side by `status` and `category`.
  - Sort: `accepted` first, then `confidence` descending.
  - **Concise item (tightened for principle 3):** `{ category, rule, status, confidence }`. `id` is dropped (no tool takes a convention id) and so is `origin` (provenance, not needed to apply the rule). Detailed item: `{ id, category, rule, status, confidence, origin, rationale, evidence: { path, line, snippet }, created_at }`.
  - Output, concise: `{ repo_id, total, next_offset, conventions: [...] }`. Detailed: `{ repo_id, total, offset, next_offset, conventions: [...] }`.
  - **Empty / errors (principle 4):**
    - The repo has no conventions → `ok` with `conventions: []` and `note: "No conventions extracted yet for this repo — extraction runs from the DevDigest UI (repo → Conventions page); ask the user to run it, then call get_conventions again."`
    - Conventions exist but the filters remove all of them → `ok` with `note: "No conventions match status/category (<n> in this repo without the filters) — drop status or category."`
    - A 404 → `fromApiError(entity:'repo')`, which carries the "a PR id will not work — ask the user" hint.
  - Description: `"House coding conventions DevDigest extracted for a repo. Filter by status/category; paginate with offset/limit."`
- **Skills to invoke:** `zod`, `typescript-expert`
- **Depends on:** Step 5
- **Done when:** `test/get-conventions.test.ts` passes. It checks:
  - concise payload keys are exactly `repo_id, total, next_offset, conventions`, and concise items are exactly `category, rule, status, confidence` (no `id`, `origin`, `evidence`)
  - detailed items include `id`, `origin` and `evidence`
  - the status and category filters, and the filtered-to-zero note
  - pagination
  - a 404 is `isError` with the repo hint

### Step 11 — `get_blast_radius` mock tool  ·  [backend]
- **Files:** `devdigest-mcp/src/fixtures/blast-radius.mock.ts` (new) · `devdigest-mcp/src/tools/get-blast-radius.ts` (new)
- **Layer:** application (the fixture is a pure literal)
- **Interfaces:**
  ```ts
  // fixtures/blast-radius.mock.ts
  import type { BlastRadius } from '@devdigest/shared';
  export const BLAST_RADIUS_MOCK = {
    changed_symbols: [ { name: 'ReviewService.runReview', file: 'server/src/modules/reviews/service.ts', kind: 'method' }, /* 1–2 more */ ],
    downstream: [ { symbol: 'ReviewService.runReview',
                    callers: [ { name: 'reviewsRoutes', file: 'server/src/modules/reviews/routes.ts', line: 37 } ],
                    endpoints_affected: ['POST /pulls/:id/review'], crons_affected: [] } ],
    summary: '[MOCK] Static sample — blast radius is not wired to repo-intel yet (L04). Do not base decisions on it.',
  } as const satisfies BlastRadius;
  // tools/get-blast-radius.ts
  export const getBlastRadiusInput = {
    pr_id: z.string().uuid({ message: `pr_id: ${ID_HINTS['pull request']}` }).describe('DevDigest pull-request id'),
    changed_files: z.array(z.string()).max(200).optional().describe('Ignored by the mock'),
  };
  export async function getBlastRadiusHandler(args, deps: ToolDeps): Promise<CallToolResult>; // ok(BLAST_RADIUS_MOCK) — no HTTP call
  export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void;
  ```
  - The description must start with `"MOCK — returns a fixed sample, not real analysis."`.
  - The payload shape is exactly `BlastRadius` (`brief.ts:39-44`), so wiring the real route later replaces only the handler body. It has no concise/detailed switch: the fixture is already small, and a projection would break the "shape is exactly `BlastRadius`" guarantee.
  - The fixture's cited file/line references are real: `reviews/routes.ts:37` is the `service.runReview` call site.
  - Inputs are flat (`pr_id` scalar, `changed_files` array of strings). There is no error path besides input validation, because no HTTP call is made.
- **Skills to invoke:** `typescript-expert`
- **Depends on:** Step 5
- **Done when:** `pnpm typecheck` passes (the `satisfies BlastRadius` check), and a test asserts that the handler makes no `DevDigestApi` call and returns a summary starting with `[MOCK]`.

### Step 12 — Server composition and stdio entry point  ·  [backend]
- **Files:** `devdigest-mcp/src/server.ts` (new) · `devdigest-mcp/src/index.ts` (new)
- **Layer:** presentation (MCP protocol boundary) + composition root
- **Interfaces:**
  ```ts
  // server.ts
  export const SERVER_INFO = { name: 'devdigest', version: '0.0.0' } as const;
  export function createServer(deps: ToolDeps): McpServer; // new McpServer(SERVER_INFO, { instructions }) + the 5 register* calls
  export function defaultDeps(config: McpConfig): ToolDeps;  // real api, setTimeout-based abortable sleep, Date.now
  // index.ts
  // #!/usr/bin/env -S npx tsx   (only if bin is kept)
  // const config = loadConfig(); const server = createServer(defaultDeps(config));
  // await server.connect(new StdioServerTransport());
  // console.error(`devdigest-mcp ready → ${config.apiBase}`);   // stderr ONLY
  ```
  - **Registration idiom:** use `server.registerTool(name, { title, description, inputSchema: <raw Zod shape from each tool file> }, handler)`. This is the SDK's current form of the `server.tool(name, description, shape, handler)` idiom, and both take a Zod raw shape. If the installed 1.x version lacks `registerTool`, use `server.tool(name, description, shape, handler)` with the same arguments.
  - Tool names are exactly: `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`.
  - Add `annotations: { readOnlyHint: true }` on every tool except `run_agent_on_pr`. That one gets `{ readOnlyHint: false, idempotentHint: false, openWorldHint: false }`.
  - `instructions` (one short paragraph):
    - ids are DevDigest uuids, and the PR number is not an id
    - the usual order is list_agents → run_agent_on_pr, which already returns the verdict and findings; call get_findings only to page further or re-read later
    - blast radius is a mock
  - `index.ts`:
    - A startup `loadConfig` failure → print to stderr and `process.exit(1)`.
    - Handle `SIGINT` by calling `server.close()`.
    - **Do not** probe the API at startup. The server must boot even when the API is down; each tool reports `network_error` instead.
- **Skills to invoke:** `typescript-expert`, `security`
- **Depends on:** Steps 6, 7, 9, 10, 11
- **Done when:** `test/server.test.ts` passes. It uses the SDK's `InMemoryTransport.createLinkedPair()` plus a `Client` against `createServer(fakeDeps)`, then:
  - `listTools()` returns exactly the 5 names, each with an `inputSchema`
  - **M9 guard:** for every tool, every `inputSchema.properties[*]` has `type` ≠ `"object"`, and any `type: "array"` has `items.type` ≠ `"object"`
  - `callTool({ name: 'get_blast_radius', arguments: { pr_id: <uuid> } })` returns the mock
  - `callTool` for `get_findings` with `pr_id: 'abc'` is rejected by input validation, and the surfaced text contains `not the GitHub PR number` (whether the SDK returns it as an `isError` result or as an `InvalidParams` error, see Risks)

  Also check stdout by hand: `pnpm --silent start < NUL` (PowerShell: `"" | pnpm --silent start`) writes nothing to stdout, and the ready line appears on stderr.

### Step 13 — Package docs: CLAUDE.md, README, docs/, specs/, INSIGHTS.md  ·  [n/a — docs]
- **Files:** `devdigest-mcp/CLAUDE.md` (new) · `devdigest-mcp/README.md` (new) · `devdigest-mcp/docs/tools.md` (new) · `devdigest-mcp/specs/tool-contract.md` (new) · `devdigest-mcp/INSIGHTS.md` (new)
- **Layer:** n/a
- **Interfaces:**
  - `CLAUDE.md`: mirror the shape of `e2e/CLAUDE.md` / `reviewer-core/CLAUDE.md`. Sections: one-line role · links (README, docs/tools.md, specs/tool-contract.md, INSIGHTS.md) · Stack · Commands (`pnpm start`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm inspect`) · Env (the 4 vars from Step 2) · Where things live (a table of `src/` files) · Non-default conventions, including:
    - HTTP only, never import `server/`
    - `@devdigest/shared` is `import type` only
    - tool errors are `isError` results, never throws
    - the four design principles, one line each, linking to `specs/tool-contract.md` M9–M11 (and M4 for principle 1)
    - `concise` is the default
    - stdout is protocol-only

    Also Gotchas: `console.log` breaks stdio; plain `pnpm start` prints a banner to stdout, so clients must use `pnpm --silent` or the `tsx` binary directly; PR ids are uuids, not GitHub numbers. Do not touch: `get_blast_radius` stays a mock until the server ships a blast route.
  - `README.md`: what it is · prerequisites (API running via `./scripts/dev.sh`, `pnpm install` in this folder) · client setup snippets:
    - **Claude Code:** `claude mcp add devdigest -e DEVDIGEST_API_BASE=http://localhost:3001 -- <abs>/devdigest-mcp/node_modules/.bin/tsx <abs>/devdigest-mcp/src/index.ts` (on Windows: `...\node_modules\.bin\tsx.cmd`)
    - **Claude Desktop:** a `claude_desktop_config.json` `mcpServers.devdigest` block with the same `command`/`args`/`env`
    - The Inspector: `pnpm inspect`
  - `docs/tools.md`:
    - A short "Design principles" section at the top: the four rules, as in this plan.
    - One section per tool. Each gives the endpoint(s) with the `file:line` refs from **Context**, the parameter table, a concise/detailed example output, and the error cases with their next-step text.
    - `run_agent_on_pr` shows **three** concise examples: single agent, all agents with disagreeing verdicts, and truncated.
    - Include a `mermaid` sequence diagram of `run_agent_on_pr` (create → poll loop → collect), labelled as the principle-1 flow.
  - `specs/tool-contract.md`: the invariants, numbered **M1…**:
    - M1: exactly these 5 tool names
    - M2: `concise` is the default. It omits `system_prompt/output_schema/rationale/suggestion/evidence/summary`, finding and convention `id`s, `origin`, the echoed `offset`, and `run_agent_on_pr`'s `runs[]` run bookkeeping.
    - M3: errors are `isError:true`
    - M4: `run_agent_on_pr` returns only findings from the runs it triggered. It performs create → wait → collect in one call (principle 1, "result, not operation"). There is no separate start or status tool.
    - M5: terminal statuses are `done|failed|cancelled`, and any non-`done` makes the result `isError`
    - M6: a timeout never cancels server runs
    - M7: no runtime import of `@devdigest/shared`
    - M8: `get_blast_radius` makes no HTTP call and its summary starts with `[MOCK]`
    - M9 (principle 2): **flat scalar arguments only.** Every tool input property is a string, number, integer, boolean, enum, or an array of those. No input is an object or an array of objects. Ids are separate named scalars. Enforced by the M9 guard test in Step 12.
    - M10 (principle 3): **concise defaults to verdict + findings, not a full dump.** `run_agent_on_pr` concise is `{ pr_id, agent_name, verdict, score, findings }` for `agent_id`, and `{ pr_id, results: [{ agent_name, verdict, score, findings_count }], findings }` for `all_agents`. The shape is keyed by input mode, and there is never an aggregate verdict across agents. `truncated`/`total_findings`/`next` appear only when findings were cut. Every other tool's concise projection carries only fields a caller acts on (Steps 6, 7, 10).
    - M11 (principle 4): **every not-found/invalid error names a concrete next tool or fix.** Every `isError` text and every empty-result `note` has the form `"<what failed> — <next step>"`, and the next step is a tool call (`list_agents`, `run_agent_on_pr`, `get_findings`), a changed argument, or a concrete user action (start the API, ask the user for the uuid, add an API key). A bare status code or "not found" with no next step violates the contract.
  - `INSIGHTS.md`: copy the header paragraph style and the **seven fixed section headings** from root `INSIGHTS.md` (`## What Works`, `## What Doesn't Work`, `## Codebase Patterns`, `## Tool & Library Notes`, `## Recurring Errors & Fixes`, `## Session Notes`, `## Open Questions`), all empty.
- **Skills to invoke:** `mermaid-diagram` (the docs/tools.md diagram), `engineering-insights` (the INSIGHTS.md skeleton and format)
- **Depends on:** Step 12
- **Done when:** every link in `devdigest-mcp/CLAUDE.md` resolves to a file in the package, the `file:line` refs in `docs/tools.md` match those in this plan's Context table, and `specs/tool-contract.md` lists M1–M11 with M10's two shapes matching Step 9's concise table verbatim.

### Step 14 — Add the package to the root repo map  ·  [n/a — docs]
- **Files:** `CLAUDE.md` (edit, root). This is the **only** cross-package file touched.
- **Layer:** n/a
- **Interfaces:** in the `## Repo map` table, insert after the `e2e/` row:
  `| \`devdigest-mcp/\` | \`@devdigest/mcp\` | MCP server (stdio) — exposes agents, review runs, findings, conventions to MCP clients over the API | — |`
  Change nothing else in the file.
- **Skills to invoke:** none (docs-only edit)
- **Depends on:** Step 13
- **Done when:** `git diff CLAUDE.md` shows exactly one added table row.

## Contract changes
None. No file under `server/src/vendor/shared/**` or `client/src/vendor/shared/**` is edited. The new package consumes the server copy's existing `Agent`, `RunRequest`, `ReviewRunResponse`, `RunSummary`, `ReviewRecord`, `FindingRecord`, `Convention`, `Severity`, `ConventionStatus`, `ConventionCategory` and `BlastRadius` types, as `import type` only. The concise/detailed projections are local output shapes of the MCP tools. They are not `@devdigest/shared` contracts.

## Database
None. The package is stateless: a pure HTTP client with no DB access and no persistence.

## Verification
1. `cd devdigest-mcp && pnpm install && pnpm typecheck && pnpm build && pnpm test`. All hermetic: no API, no network, fake clock.
2. `cd server && pnpm typecheck && pnpm test && pnpm arch`. This is a no-op sanity check that nothing under `server/` changed, and it should match `main`.
3. `cd client && pnpm typecheck && pnpm test`. Same no-op sanity check.
4. Start the stack with `./scripts/dev.sh` (runs migrate and seed), then get ids:
   - `curl http://localhost:3001/repos` → `<repoId>`
   - `curl http://localhost:3001/repos/<repoId>/pulls` → a PR `id` (uuid) as `<prId>`
   - `curl http://localhost:3001/agents` → `<agentId>`
5. `cd devdigest-mcp && pnpm inspect`. In the MCP Inspector, **Tools → List** shows exactly 5 tools, and no input property in any schema is an object (M9). Then:
   - `list_agents {}` → compact JSON with `agents[]` and no `system_prompt`. With `{"response_format":"detailed"}`, `system_prompt` is present.
   - `get_findings {"pr_id":"<prId>"}` → `{ pr_id, results, total, next_offset, findings }` with the seeded review's findings, CRITICAL first, no finding `id`, and `next_offset` set when there are more than 25 findings. `{"pr_id":"<prId>","severity":["CRITICAL"]}` narrows the list. `{"pr_id":"00000000-0000-0000-0000-000000000000"}` → `isError` with the "not the GitHub PR number — ask the user" hint. `{"pr_id":"42"}` → rejected by input validation with the same hint.
   - `get_conventions {"repo_id":"<repoId>"}` → `{ repo_id, total, next_offset, conventions }` with items `{ category, rule, status, confidence }`, or the "No conventions extracted yet — … ask the user to run it" note. `{"repo_id":"<prId>"}` → `isError` "Repo … not found — repo_id must be the DevDigest repo uuid (a PR id will not work) …".
   - `get_blast_radius {"pr_id":"<prId>"}` → the mock, with a summary starting `[MOCK]`.
   - `run_agent_on_pr {"pr_id":"<prId>"}` → `isError` "Pass exactly one of agent_id (call list_agents …".
   - `run_agent_on_pr {"pr_id":"<prId>","agent_id":"00000000-0000-0000-0000-000000000000"}` → `isError` "Agent … not found — call list_agents …".
   - `run_agent_on_pr {"pr_id":"<prId>","agent_id":"<agentId>"}`.
     - With a provider key configured, it blocks, shows progress notifications, and returns exactly `{ pr_id, agent_name, verdict, score, findings }`, with no `runs` key. Re-run with `"response_format":"detailed"` to see `runs[0].status:"done"` and findings whose `run_id` equals that run.
     - With no key configured, the run ends `failed` (`container.llm()` throws, per `server/CLAUDE.md`), and the tool returns `isError` whose text includes the run's error, "retry run_agent_on_pr" and the Settings → API keys hint.
     - Either outcome verifies the tool.
   - `run_agent_on_pr {"pr_id":"<prId>","all_agents":true}` (only with a key) → `{ pr_id, results: [...one line per enabled agent...], findings }` with no top-level `verdict`.
   - Stop the API (Ctrl-C in dev.sh) and call `list_agents` → `isError` "DevDigest API unreachable at http://localhost:3001 — start it with ./scripts/dev.sh, then retry.". The MCP server itself must still be alive.
6. **End-to-end in a real client:** register with Claude Code as in the README (`claude mcp add devdigest …`), start a session, run `/mcp` and confirm `devdigest` is connected with 5 tools. Then ask: *"List DevDigest agents, run the first enabled one on PR `<prId>`, and summarize the critical findings."* The model should chain `list_agents` → `run_agent_on_pr` → answer from the returned verdict and findings, without calling `get_findings` separately (principle 1). Then ask it to *"run agent `00000000-0000-0000-0000-000000000000` on that PR"*. It should recover by calling `list_agents` on its own after the error (principle 4).

## Risks / open questions
- **Step 9, client-side request timeouts.** MCP clients cap how long they wait for one tool call. The SDK client default is about 60s unless it resets on progress, and Claude Code honours `MCP_TOOL_TIMEOUT`. Reviews can run longer. Progress notifications mitigate this only for clients that reset on progress. The README should document raising `MCP_TOOL_TIMEOUT` for Claude Code. The timeout error already points to `get_findings` as the recovery path. This is the cost of principle 1 (one blocking call).
- **Step 12, SDK API drift.** `server.tool()` is deprecated in newer 1.x versions in favour of `registerTool`, and the SDK's zod peer range (3.25+ vs 4) has moved over time. Step 1 pins whatever is installed, and the implementer must record the chosen version in `devdigest-mcp/INSIGHTS.md` under Tool & Library Notes.
- **Steps 7, 9, 10, 12: input-validation errors and M11.** Depending on SDK version, a Zod input failure comes back either as an `isError` tool result or as a JSON-RPC `InvalidParams` error, and its text wraps the Zod issue list. The custom `{ message }` on each uuid/id validator (built from `ID_HINTS`) makes sure the next-step hint is inside that text either way. The implementer records which behaviour the pinned SDK has in `INSIGHTS.md`. If validation errors reach the model as protocol errors it cannot see, M11 holds only for handler-level errors; note that under Open Questions rather than hand-validating inputs.
- **Steps 4 and 7, unvalidated responses.** Responses are cast, not parsed, because runtime-parsing the shared schemas would need a runtime import (decision 1). If the vendored server contract drifts from what the API returns, projection could silently emit `undefined` fields. This is acceptable for a local trusted API, but it is a deliberate trade-off.
- **Step 9, verdict source.** `verdict`/`score` come from the `ReviewRecord` whose `run_id` matches the run. If the "done ⇒ persisted" ordering (`run-executor.ts:249-275`) ever changes, concise output would show `verdict: null` for a done run instead of failing loudly. The single-concise happy-path test pins the current behaviour.
- **Step 7, repeated runs of one agent.** `get_findings` without `run_id` returns findings from every review on the PR, including older runs of the same agent, so concise output can repeat near-identical findings. `results[]` exposes `run_id` so the caller can narrow. A "latest review per agent" default would be smaller, but it changes semantics, so it is not planned.
- **Step 10, the premise corrected.** `PrMeta` carries no `repo_id` (`platform.ts:159-183`), so "look up repo from PR" is not possible through the PR contract. Callers need the repo uuid from `GET /repos`. A `list_repos` / PR-number resolver tool would remove this friction, but it is not planned; it would be a sixth tool.
- **Steps 5–11, uuid vs PR number, and principle 4's limit.** An LLM caller will naturally say "PR #12". With no repo/PR listing tool, the best next step an error can name for a bad PR or repo id is "ask the user". A resolver tool is the real fix (not planned). Once one exists, `ID_HINTS['pull request']` and `ID_HINTS.repo` should name it.
- **Step 9, rate limit.** `all_agents` on a PR, called twice within a minute with several agents, can exhaust the 10/min cap (`reviews/routes.ts:29`). The error message covers it, and no client-side limiter is planned.
- **Skills infra gap (not planned):** the `pr-self-review` Step 2 path map has no `devdigest-mcp/**` row, so only the generic `typescript-expert`/`zod`/`security` rows will route these files. The `engineering-insights` routing table likewise has no `devdigest-mcp/INSIGHTS.md` row. Both skills deserve a one-row addition in a follow-up.
- **Docs drift (not planned):** `docs/architecture.md:17-28` (the package dependency diagram) and the root `README.md` should eventually list `devdigest-mcp`. Only the root `CLAUDE.md` row is in scope.
- **CI (not planned):** there is no `.github/workflows/devdigest-mcp.yml`, so the package's tests run locally only.
- **Future Blast Radius (not planned):** when a `blast` server module exposes `getBlastRadius` (`repo-intel/service.ts:220`), only `get-blast-radius.ts`'s handler body changes; the output shape is already `BlastRadius`.

## Do-not-touch confirmations
- `server/src/db/migrations/**` + `meta/_journal.json`: untouched. There is no DB work at all.
- `server/src/modules/repo-intel/**`: untouched. The blast tool is a static fixture inside `devdigest-mcp/src/fixtures/`.
- `server/src/vendor/shared/**` and `client/src/vendor/shared/**`: untouched. They are read only, through `import type` via tsconfig `paths` pointing at the server copy.
- `client/src/vendor/ui/**`: not referenced.
- `skills-lock.json`: not touched. No skill is added or modified.
- `server/clones/**`, `client/.next/**`, `**/test-results/**`: not referenced. The new package writes no runtime artifacts, and `node_modules/` is already git-ignored by root `.gitignore:1`.
- Lesson scaffolding (unused tables, contracts, i18n namespaces): nothing is deleted. The `BlastRadius` contract is consumed as a type, not modified.
