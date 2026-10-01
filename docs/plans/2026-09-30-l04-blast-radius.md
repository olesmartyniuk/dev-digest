# Plan — L04 Blast Radius (PR Overview block + real `get_blast_radius` MCP tool)
**Request:** For each changed symbol in a PR, show who calls it (file:line) and which HTTP endpoints and cron jobs those callers reach. The data comes from the `repo-intel` facade that already exists. No fresh analysis and no LLM call. Two deliverables: (1) a "Blast radius" block on the PR detail page's Overview tab; (2) the `get_blast_radius` MCP tool in `devdigest-mcp`, which today returns a static mock, becomes a real call to the new HTTP route.
**Status:** READY FOR IMPLEMENTER
**Packages touched:** server · client · devdigest-mcp · shared (×2 — one NEW file per copy, plus one barrel line per copy)
**Out of scope:**
- Any new analysis, any LLM call, any change to `server/src/modules/repo-intel/**`. `RepoIntelService.getBlastRadius` is consumed exactly as it is.
- New DB tables, columns or migrations.
- Editing `contracts/brief.ts` in either copy. `BlastRadius` / `DownstreamImpact` / `BlastCaller` / `ChangedSymbol` stay byte-identical.
- P3 / stretch work: the collapsible tree view, the Tree/Graph toggle (`view.tree`/`view.graph`/`graph.*` keys stay unused), and the "Prior PRs touching these files" block. See the optional Step 10. It is not required for P1.
- Any cron-specific UI beyond rendering `crons_affected` at the same tier as endpoints.
- Moving the block into `PrBriefCard`. Its header comment says "L05 adds Blast/…", but this request puts it on the Overview tab. See Risks.
- e2e flows. The seeded demo repo has no repo-intel index, so a deterministic flow would only ever exercise the degraded path. See Risks.
- A `response_format` param on `get_blast_radius`.
**Sources read:** `CLAUDE.md`, `INSIGHTS.md`, `server/INSIGHTS.md`, `client/CLAUDE.md`, `client/INSIGHTS.md`, `devdigest-mcp/CLAUDE.md`, `devdigest-mcp/INSIGHTS.md`, `devdigest-mcp/specs/tool-contract.md`, `devdigest-mcp/docs/tools.md:165-183`, `server/specs/api-contract.md:51-97`, `server/src/modules/index.ts`, `server/src/modules/intent/routes.ts`, `server/src/modules/smart-diff/{routes,service}.ts`, `server/src/modules/repo-intel/{types,constants}.ts`, `server/src/modules/repo-intel/service.ts:211-391`, `server/src/modules/reviews/repository/pull.repo.ts`, `server/src/platform/container.ts` (`repoIntel`/`reviewRepo` getters, `ContainerOverrides.repoIntel`), `server/.dependency-cruiser.cjs:77-90`, `server/src/vendor/shared/{index.ts,contracts/brief.ts,contracts/intent.ts,contracts/review-api.ts}`, `client/src/vendor/shared/index.ts`, `server/test/smart-diff-routes.test.ts`, `server/test/contracts.test.ts`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `…/_hooks/usePrDetail.ts:119`, `…/_components/OverviewTab/{OverviewTab.tsx,styles.ts}`, `…/_components/PrBriefCard/{PrBriefCard.tsx,PrBriefCard.test.tsx}`, `…/_components/FindingCard/FindingCard.tsx:40-48`, `client/src/lib/hooks/{index,smart-diff,repo-intel}.ts`, `client/src/lib/github-urls.ts`, `client/src/i18n/request.ts`, `client/messages/en/blast.json`, `devdigest-mcp/src/{server.ts,api/endpoints.ts,tools/get-blast-radius.ts,tools/get-conventions.ts,tools/result.ts,fixtures/blast-radius.mock.ts}`, `devdigest-mcp/test/{server,get-blast-radius,get-conventions}.test.ts`, `.claude/skills/pr-self-review/SKILL.md` (Step 2 map), `.claude/agents/*.md`.

**Pipeline:** this plan is the input to the repo's L03 subagent pipeline: `planner` (this file) → `implementer` → `architecture-reviewer` ∥ `plan-verifier`. All four agents exist under `.claude/agents/`. Before any push or PR, run `pr-self-review`.

---

## Context

### Server: what exists and gets consumed
- **`RepoIntelService.getBlastRadius(repoId, changedFiles)`** (`server/src/modules/repo-intel/service.ts:220`) is fully implemented and reached through `container.repoIntel`. It returns a `BlastResult` (`repo-intel/types.ts:74-87`):
  - `changedSymbols: {file,name,kind}[]`
  - `callers: {file, symbol, viaSymbol, line, rank}[]`: a FLAT list, one row per (caller, viaSymbol)
  - `impactedEndpoints: string[]`: a flat union across all callers
  - `factsByFile?: Record<file,{endpoints,crons}>`: keyed by caller FILE, only on the persistent path
  - `degraded?: boolean`
  - `reason?: DegradedReason`, where `DegradedReason = 'flag_off'|'index_failed'|'index_partial'|'repo_too_large'|'no_data'` (`types.ts:27-32`)
- **Two behaviours of that facade the UI has to accept as they are** (not fixed here):
  - The ripgrep fallback (`service.ts:297-303`) ALWAYS returns `degraded: true, reason: 'no_data'`, even when it found callers. It never returns `factsByFile`. So "degraded" ≠ "empty": the block must render the callers it got AND a degraded notice.
  - The persistent path (`service.ts:338`, `384-390`) returns `degraded: false` with no `reason`.
- **Container:**
  - `container.repoIntel` is the facade getter. Tests can override it via `ContainerOverrides.repoIntel` (`container.ts:52,136-139`).
  - `container.reviewRepo.getPull(workspaceId, prId)` returns a `PullRow` with `repoId` and `headSha` (`pull.repo.ts:9-19`, `db/schema/pulls.ts:12,20`).
  - `container.reviewRepo.getPrFiles(prId)` returns `pr_files` rows with `path` (`pull.repo.ts:29-34`).
- **Templates:**
  - `server/src/modules/smart-diff/` is the house template for a no-table, no-LLM, read-only module: `routes.ts` constructs `new SmartDiffService(container)`, `service.ts` resolves the pull and its files through `container.reviewRepo`, and the pure shaping lives in `helpers.ts`.
  - `server/src/modules/intent/routes.ts` shows the same `GET /pulls/:id/...` shape: `IdParams`, `getContext(container, req)` → `workspaceId`.
- **`server/src/modules/blast/` does not exist.** `modules/index.ts:25` already names "blast" as a future lesson module.
- **Layering constraint, verified in `.dependency-cruiser.cjs:77-90`:** `no-cross-module-reach` forbids any `src/modules/blast/**` → `src/modules/repo-intel/**` import, type-only imports included. So the blast module must NOT `import type { BlastResult } from '../repo-intel/types.js'`. It declares its own structural input type in `blast/types.ts` (Step 2). Only `platform/container.ts` imports `RepoIntel` (`container.ts:30`).

### Contract: what exists
- The `BlastRadius` family in `contracts/brief.ts:16-44` is identical in `server/src/vendor/shared` and `client/src/vendor/shared`:
  - `{ changed_symbols: ChangedSymbol[], downstream: DownstreamImpact[], summary: string }`
  - `DownstreamImpact = { symbol, callers: BlastCaller[], endpoints_affected: string[], crons_affected: string[] }`
  - `BlastCaller = { name, file, line }`
- It has no degraded or reason field.
- `PrBrief.blast` (`brief.ts:118`) and `devdigest-mcp/src/fixtures/blast-radius.mock.ts:24` (`satisfies BlastRadius`) depend on its exact shape.
- **Precedent for extending a contract:**
  - `contracts/intent.ts:31` builds `PrIntentView = Intent.extend({...})` in a NEW file and leaves `brief.ts` untouched. Its docblock says so explicitly (`intent.ts:9-10`).
  - The barrel's own rule (`index.ts:14-15`): "feature agents EXTEND with new files, they do not edit existing ones".
  - No `contracts/blast.ts` exists in either copy (verified by Glob).

### Shape mismatch the mapping must bridge (load-bearing)
`BlastResult.callers` is FLAT, and each row names the changed symbol it reaches in `viaSymbol`. `BlastRadius.downstream` is GROUPED per changed symbol. The server helper must:
1. group `callers` by `viaSymbol`;
2. map each row `{file, symbol, line}` → `BlastCaller {name: symbol, file, line}`;
3. for each group, union `factsByFile[caller.file].endpoints` / `.crons` over the group's distinct caller files. Treat a missing `factsByFile`, or a missing key, as `[]`.

`summary` is a plain string built from counts. No LLM.

### Client: what exists
- **`page.tsx:110`** renders `<OverviewTab prBody={pr.body} />`.
  - The sibling tabs already get `repoFullName={repoFullName}` and `headSha={pr.head_sha}` (`page.tsx:121-122,138-139`).
  - `repoFullName` is `string | null` (`usePrDetail.ts:119`).
  - `prId` is nullable: the page guards it with `prId && …` at `page.tsx:108`.
- **`OverviewTab.tsx`** renders only the description. Its props are `{ prBody }`.
- **`FindingCard.tsx:47-48`** is the precedent for a guarded GitHub link: `repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line) : null`.
- **`githubBlobUrl(repoFullName, sha, file, startLine?, endLine?)`** is in `client/src/lib/github-urls.ts:24`. Reuse it. Do not reimplement it.
- **Hooks:**
  - The hook template is `usePrSmartDiff` in `client/src/lib/hooks/smart-diff.ts`. The barrel is `client/src/lib/hooks/index.ts`.
  - The index-state hook is **`useRepoIntelStatus(repoId, poll?)`** in `client/src/lib/hooks/repo-intel.ts:31`. This plan does NOT use it: the blast route carries `degraded`/`degraded_reason` itself.
- **i18n:**
  - The mechanism is next-intl. `client/src/i18n/request.ts` auto-loads every `messages/en/<ns>.json` as namespace `<ns>`, so no registration is needed.
  - Components call `useTranslations("blast")`.
  - Tests import the JSON directly and wrap in `NextIntlClientProvider` (`PrBriefCard.test.tsx:11,14`).
- **Scaffolding consumed, not created:** `client/messages/en/blast.json` exists with `stat.{symbols,callers,endpoints,crons}`, `callerCount`, `noDownstream`, `view.*` and `graph.*`. It gets extended (Step 6), not replaced.
- **Colocated child-component precedent:** `PrBriefCard/_components/IntentBlock/`.

### MCP: what exists
- **`devdigest-mcp/src/tools/get-blast-radius.ts`:**
  - returns `ok(BLAST_RADIUS_MOCK)` and makes no API call;
  - its `DESCRIPTION` says "MOCK";
  - `changed_files` is `.optional().describe('Ignored by the mock')`.
- **`devdigest-mcp/src/server.ts:18`** has the INSTRUCTIONS line `'get_blast_radius is a static mock — it does not run real analysis.'`.
- **`DevDigestApi`** in `src/api/endpoints.ts:10-16` has 5 methods.
- **Tests asserting the mock that must change:**
  - `devdigest-mcp/test/get-blast-radius.test.ts`: asserts no API call plus `[MOCK]`.
  - `devdigest-mcp/test/server.test.ts:68-77`: asserts `[MOCK]`.
  - `server.test.ts:9-15`: builds a full `DevDigestApi` literal, so adding an interface method breaks it at typecheck until it is extended.
- **Docs and specs that state the mock:**
  - `specs/tool-contract.md:12` (invariant **M8**)
  - `docs/tools.md:165-183`
  - `CLAUDE.md:49-50,77`
  - `README.md:3,55`
  - `package.json:6` (description)
- **Package rules:**
  - `@devdigest/shared` is `import type` only (M7). It resolves to the **server** copy.
  - Every runtime zod import is `from 'zod/v4'` (`devdigest-mcp/INSIGHTS.md:17`).
  - Errors go through `fromApiError(e, { entity: 'pull request', id })` (`result.ts:48`).

---

## Steps

### Step 1 — Add the `BlastRadiusResponse` contract (server copy first, then mirror)  ·  [full-stack]
- **Files:**
  - `server/src/vendor/shared/contracts/blast.ts` (new)
  - `server/src/vendor/shared/index.ts` (edit: one `export *` line, plus one docblock line)
  - `client/src/vendor/shared/contracts/blast.ts` (new, byte-identical to the server copy)
  - `client/src/vendor/shared/index.ts` (edit: same line, same docblock line)
  - `server/test/contracts.test.ts` (edit: one new `it`)
- **Layer:** n/a (shared contract)
- **Interfaces:**
  ```ts
  import { z } from 'zod';
  import { BlastRadius } from './brief.js';

  /** L04 — mirrors repo-intel's DegradedReason (server/src/modules/repo-intel/types.ts:27-32). */
  export const BlastDegradedReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']);
  export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

  /** GET /pulls/:id/blast. Extends BlastRadius (brief.ts) rather than editing it —
   *  BlastRadius stays the bare PrBrief building block (same rule as intent.ts). */
  export const BlastRadiusResponse = BlastRadius.extend({
    pr_id: z.string(),
    degraded: z.boolean(),
    degraded_reason: BlastDegradedReason.nullable(),
  });
  export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;
  ```
  - Barrel line, placed right after `export * from './contracts/intent.js';` in both `index.ts` files: `export * from './contracts/blast.js';`.
  - Add a docblock line ` *  - contracts/blast      BlastRadiusResponse, BlastDegradedReason (L04)`.
- **Decision (contract) — option (a), done as a NEW file rather than by editing `brief.ts`:**
  - **Why not fold the reason into `summary` (option b):** the acceptance criteria need the UI to tell "no callers" apart from "index incomplete". A reason buried in a free-text `summary` can't drive a distinct notice, can't be translated, and can't be branched on.
  - **Why not add optional fields to `BlastRadius` itself:** that would edit an existing shared file and change `PrBrief.blast`. `.extend()` in a new file is the established pattern (`intent.ts:31`, `review-api.ts:60`) and leaves `brief.ts` byte-identical in both copies.
  - **Why `degraded` is required (not optional) on the response:** the route always knows the value. A required boolean removes the "undefined means what?" branch from the client.
  - **Why `degraded_reason` is `nullable`, not optional:** it matches house style (`PrIntentResponse.skipped`).
  - **Why `pr_id`:** MCP output echoes which PR it describes.
- **Skills to invoke:** `zod`, `typescript-expert`
- **Depends on:** nothing
- **Done when:**
  - Both `contracts/blast.ts` files are identical (diff them).
  - `cd server && pnpm typecheck` and `cd client && pnpm typecheck` pass.
  - The new `contracts.test.ts` case passes. It parses one non-degraded payload (`degraded:false, degraded_reason:null`) and one degraded payload (`degraded:true, degraded_reason:'no_data'`), and rejects `degraded_reason:'bogus'`.

### Step 2 — Pure mapping helper `BlastResult` → `BlastRadiusResponse`  ·  [backend]
- **Files:**
  - `server/src/modules/blast/types.ts` (new)
  - `server/src/modules/blast/constants.ts` (new)
  - `server/src/modules/blast/helpers.ts` (new)
  - `server/test/blast-helpers.test.ts` (new, hermetic)
- **Layer:** domain (`helpers.ts`/`types.ts`/`constants.ts`). These may import only `@devdigest/shared` types. No Fastify, Drizzle or Container (`no-domain-outward`).
- **Interfaces:**
  - `types.ts` holds the structural mirror of the facade result. It must NOT import from `../repo-intel/`, because `no-cross-module-reach` forbids it:
    ```ts
    import type { BlastDegradedReason } from '@devdigest/shared';
    export interface BlastFacadeResult {
      changedSymbols: { file: string; name: string; kind: string }[];
      callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
      impactedEndpoints: string[];
      factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
      degraded?: boolean;
      reason?: BlastDegradedReason;
    }
    ```
    This doubles as a compile-time drift guard. If repo-intel's `DegradedReason` union gains a member, passing the facade's `BlastResult` into a `BlastFacadeResult` parameter fails `pnpm typecheck` in Step 3, so the contract enum gets updated deliberately.
  - `constants.ts`: `export const DEGRADED_FALLBACK_REASON = 'index_failed' as const satisfies BlastDegradedReason;`. This is the reason used when the facade throws (Step 3).
  - `helpers.ts`:
    ```ts
    export function toBlastRadiusResponse(prId: string, r: BlastFacadeResult): BlastRadiusResponse
    export function buildBlastSummary(changedSymbols: number, downstream: DownstreamImpact[], degraded: boolean, reason: BlastDegradedReason | null): string
    ```
  - **Mapping rules (exact):**
    1. `changed_symbols` = `r.changedSymbols.map(s => ({ name: s.name, file: s.file, kind: s.kind }))`, in facade order.
    2. Group `r.callers` by `viaSymbol`, preserving the facade's caller order inside each group. The persistent path already sorts by `rank DESC`.
    3. Emit one `DownstreamImpact` per `viaSymbol` that has ≥1 caller.
       - Order groups by the first index at which that name appears in `r.changedSymbols`.
       - Groups whose name doesn't appear there go last, alphabetically.
       - Symbols with zero callers are NOT emitted in `downstream`. They still appear in `changed_symbols`. So "no downstream callers" ⇔ `downstream.length === 0`.
    4. `callers` = group rows mapped to `{ name: row.symbol, file: row.file, line: row.line }`.
    5. `endpoints_affected` / `crons_affected` = deduped union of `r.factsByFile?.[file]?.endpoints ?? []` / `.crons ?? []` over the group's distinct caller files, sorted with `localeCompare`.
    6. `degraded` = `r.degraded === true`. `degraded_reason` = `r.reason ?? null`, but forced to `null` when `degraded` is false.
    7. `summary` = `buildBlastSummary(...)`. The format is plain ASCII, singular and plural aware:
       - `"<S> changed symbol(s) · <C> caller(s) · <E> endpoint(s) · <J> cron job(s)"`
       - C is the sum of `callers.length`; E and J are distinct unions across `downstream`.
       - Append `" — index incomplete (<reason>)"` when degraded, using `reason ?? 'unknown'`.
       - No LLM, no i18n. It is for MCP and LLM consumers; the UI builds its own stats line.
- **Skills to invoke:** `onion-architecture`, `typescript-expert`
- **Depends on:** Step 1
- **Done when:** `server/test/blast-helpers.test.ts` covers these cases, and `cd server && pnpm test` passes:
  - (a) Grouping. Two changed symbols, flat callers interleaved across them → two groups, in `changedSymbols` order, each with the right callers.
  - (b) Attribution. `factsByFile` gives endpoint `GET /x` to caller file A (via symbol 1) and cron `nightly` to file B (via symbol 2) → each lands only on its own group.
  - (c) Degraded path. `factsByFile` absent, `degraded:true, reason:'no_data'`, with callers → callers present, endpoints/crons `[]`, `degraded_reason:'no_data'`, summary ends with `index incomplete (no_data)`.
  - (d) Empty, non-degraded → `downstream: []`, `degraded:false`, `degraded_reason:null`.
  - (e) Duplicate endpoint across two caller files in one group → appears once.

### Step 3 — `BlastService` (application layer)  ·  [backend]
- **Files:** `server/src/modules/blast/service.ts` (new)
- **Layer:** application
- **Interfaces:**
  ```ts
  export class BlastService {
    constructor(private container: Container) {}
    async get(workspaceId: string, prId: string): Promise<BlastRadiusResponse>
  }
  ```
  - **Body**, mirroring `smart-diff/service.ts:20-25`:
    1. `const pull = await this.container.reviewRepo.getPull(workspaceId, prId)`. If missing, throw `new NotFoundError('Pull request not found')` (from `../../platform/errors.js`).
    2. `const files = (await this.container.reviewRepo.getPrFiles(pull.id)).map(f => f.path)`.
    3. `const result: BlastFacadeResult = await this.container.repoIntel.getBlastRadius(pull.repoId, files)`. The explicit annotation is the drift guard from Step 2.
    4. Wrap step 3 in `try/catch`. On throw, use `{ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: DEGRADED_FALLBACK_REASON }`. Reads must never 500 just because the index is broken; this matches the "enrichment is best-effort" pattern in `server/INSIGHTS.md` (Codebase Patterns, 2026-09-16).
    5. `return toBlastRadiusResponse(pull.id, result)`.
  - **Imports allowed:**
    - `Container` type (`../../platform/container.js`)
    - `NotFoundError` (`../../platform/errors.js`)
    - its own `./helpers.js`, `./types.js`, `./constants.js`
    - `@devdigest/shared` types
  - No `../repo-intel/*`, no `../reviews/*`, no `adapters/`, no `drizzle-orm`.
  - No `repository.ts`: this module owns no table. Note this in a docblock, like `smart-diff/service.ts:14-15`.
- **Skills to invoke:** `onion-architecture`, `typescript-expert`
- **Depends on:** Step 2
- **Done when:** `cd server && pnpm typecheck && pnpm arch` pass with no NEW violations. In particular, nothing in `modules/blast/**` imports `modules/repo-intel/**`.

### Step 4 — Route `GET /pulls/:id/blast` and module registration  ·  [backend]
- **Files:**
  - `server/src/modules/blast/routes.ts` (new)
  - `server/src/modules/index.ts` (edit: add `import blast from './blast/routes.js';` and a `blast,` entry placed after `smartDiff,`)
  - `server/test/blast-routes.test.ts` (new, hermetic)
  - `server/specs/api-contract.md` (edit: new `## Blast radius` section after `## Smart diff`)
- **Layer:** presentation
- **Interfaces:**
  ```ts
  export default async function blastRoutes(appBase: FastifyInstance) {
    const app = appBase.withTypeProvider<ZodTypeProvider>();
    const { container } = app;
    const service = new BlastService(container);
    app.get('/pulls/:id/blast',
      { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
      async (req) => {
        const { workspaceId } = await getContext(container, req);
        return service.get(workspaceId, req.params.id);
      });
  }
  ```
  - Copy the docblock style from `smart-diff/routes.ts:8-20`: "read-only, no LLM, reshapes repo-intel facade data".
  - `IdParams` comes from `../_shared/schemas.js`, `getContext` from `../_shared/context.js`, `BlastRadiusResponse` from `@devdigest/shared`.
  - **`api-contract.md` row:** `| GET | /pulls/:id/blast | BlastRadiusResponse — changed symbols → callers (file:line) → endpoints/crons, reshaped from the repo-intel index; no LLM call |`
  - **`api-contract.md` paragraph:**
    - `degraded=true` with a `degraded_reason` when the index is off, partial, or missing (the ripgrep fallback always reports `no_data`, even with callers).
    - `downstream` lists only symbols with ≥1 caller.
    - Endpoints and crons are attributed only on the non-degraded path.
    - 404 when the PR is unknown.
    - A broken index yields `degraded_reason='index_failed'`, never a 500.
- **Skills to invoke:** `fastify-best-practices`, `security`, `onion-architecture`
- **Depends on:** Step 3
- **Done when:**
  - `server/test/blast-routes.test.ts` passes. It follows `smart-diff-routes.test.ts`: `buildApp({ config, overrides: { auth: new MockAuthProvider(), repoIntel: <stub> } })`, with `vi.spyOn(app.container.reviewRepo, 'getPull' | 'getPrFiles')`. The stub's `getBlastRadius` is a `vi.fn`; cast the stub `as unknown as RepoIntel`, importing the type from `../src/modules/repo-intel/types.js` as `conventions.it.test.ts:17` does. Tests may import it; only `src/modules/blast/**` may not. Cases:
    1. 200 with grouped `downstream`, and `getBlastRadius` called with `('r1', [<pr_files paths>])`.
    2. `getPull` → `undefined` gives 404.
    3. `getBlastRadius` rejects → 200 with `degraded:true, degraded_reason:'index_failed', downstream:[]`.
  - `cd server && pnpm typecheck && pnpm test && pnpm arch` are all green.

### Step 5 — Client query hook `usePrBlastRadius`  ·  [frontend]
- **Files:**
  - `client/src/lib/hooks/blast.ts` (new)
  - `client/src/lib/hooks/index.ts` (edit: add `export * from "./blast";` after `./smart-diff`)
- **Layer:** n/a (client data hook)
- **Interfaces:** a copy of `smart-diff.ts`:
  ```ts
  "use client";
  import { useQuery } from "@tanstack/react-query";
  import { api } from "../api";
  import type { BlastRadiusResponse } from "@devdigest/shared";
  /** Blast radius for a PR — reshaped repo-intel index data, no LLM. */
  export function usePrBlastRadius(prId: string | null | undefined) {
    return useQuery({
      queryKey: ["pr-blast", prId],
      queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
      enabled: !!prId,
    });
  }
  ```
  Type-only import from `@devdigest/shared`, per `client/INSIGHTS.md` (Codebase Patterns, 2026-09-22): no zod runtime in the bundle.
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `security`
- **Depends on:** Step 1
- **Done when:** `cd client && pnpm typecheck` passes.

### Step 6 — i18n keys for the block  ·  [frontend]
- **Files:** `client/messages/en/blast.json` (edit: add keys, keep every existing key unchanged)
- **Layer:** n/a
- **Interfaces:** add exactly these keys. The existing `stat.*`, `callerCount`, `noDownstream`, `view.*` and `graph.*` stay as they are.
  ```json
  "title": "Blast radius",
  "loading": "Loading blast radius…",
  "unavailable": "Couldn't load the blast radius",
  "unavailableHint": "The API didn't return blast-radius data for this PR.",
  "noSymbols": "No indexed symbols in the changed files.",
  "endpointsAffected": "Endpoints",
  "cronsAffected": "Cron/jobs",
  "openCaller": "Open {file}:{line} on GitHub",
  "degraded": {
    "title": "Index incomplete — results may be partial",
    "flag_off": "Repo intelligence is turned off; callers come from a text search and endpoints/crons are not attributed.",
    "index_failed": "The repo index failed to build; re-sync the repo to retry.",
    "index_partial": "The repo index is partial; some callers may be missing.",
    "repo_too_large": "The repo is too large to index fully; some callers may be missing.",
    "no_data": "No persistent index for this repo yet; callers come from a text search and endpoints/crons are not attributed.",
    "unknown": "The repo index is incomplete."
  }
  ```
- **Skills to invoke:** `react-frontend-best-practices`
- **Depends on:** nothing
- **Done when:** the JSON is valid (`pnpm test` loads it in Step 7's test), and the keys `stat.*`/`callerCount`/`noDownstream` still exist.

### Step 7 — `BlastRadiusBlock` component (+ child row, helpers, test)  ·  [frontend]
- **Files (all new):**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusBlock/BlastRadiusBlock.tsx`
  - `…/BlastRadiusBlock/index.ts` (exports `BlastRadiusBlock`)
  - `…/BlastRadiusBlock/helpers.ts`
  - `…/BlastRadiusBlock/styles.ts`
  - `…/BlastRadiusBlock/_components/SymbolImpactRow/SymbolImpactRow.tsx`
  - `…/BlastRadiusBlock/_components/SymbolImpactRow/index.ts`
  - `…/BlastRadiusBlock/BlastRadiusBlock.test.tsx`
- **Layer:** n/a (client UI)
- **Interfaces:**
  - **`helpers.ts`**: pure functions, no React:
    ```ts
    export interface BlastStats { symbols: number; callers: number; endpoints: number; crons: number }
    export function blastStats(b: BlastRadiusResponse): BlastStats   // symbols = changed_symbols.length; callers = Σ downstream[].callers.length; endpoints/crons = distinct unions
    export function degradedMessageKey(reason: BlastDegradedReason | null): `degraded.${BlastDegradedReason | 'unknown'}`
    export function callerHref(repoFullName: string | null | undefined, headSha: string | null | undefined, file: string, line: number): string | null
      // => repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line) : null   (import from "@/lib/github-urls")
    ```
  - **`BlastRadiusBlock` props:** `{ prId: string; repoFullName?: string | null; headSha?: string | null }`. It is the container: it calls `usePrBlastRadius(prId)` from `@/lib/hooks` and `useTranslations("blast")`. Render order, early returns first:
    1. `isLoading` → `SectionLabel` with `t("title")`, then `Skeleton`s (same pattern as `PrBriefCard.tsx:17-25`).
    2. `isError || !data` → `ErrorState title={t("unavailable")} body={t("unavailableHint")} onRetry={() => refetch()}`.
    3. Otherwise a `<section>` containing:
       - `SectionLabel` with `t("title")`.
       - **Stats line:** `"{n} {t('stat.symbols')} · {n} {t('stat.callers')} · {n} {t('stat.endpoints')} · {n} {t('stat.crons')}"`, built from `blastStats(data)`.
       - **Degraded notice:** if `data.degraded`, a `<div role="status">` with `t("degraded.title")` and `t(degradedMessageKey(data.degraded_reason))`. This renders IN ADDITION to any results, never instead of them, because the ripgrep fallback reports degraded while still returning callers.
       - **Empty states,** only one applies:
         - `changed_symbols.length === 0` → `t("noSymbols")`.
         - else `downstream.length === 0` → `t("noDownstream", { count: changed_symbols.length })`.
       - **Results:** otherwise a list, one `<SymbolImpactRow key={d.symbol} …/>` per `data.downstream` entry.
  - **`SymbolImpactRow` props:** `{ impact: DownstreamImpact; repoFullName?: string | null; headSha?: string | null }`. It is presentational and renders:
    - the symbol name (mono) and `t("callerCount", { count })`;
    - a `<ul>` of callers, each `name — file:line`. Use an `<a href target="_blank" rel="noopener noreferrer" aria-label={t("openCaller",{file,line})}>` when `callerHref(...)` is non-null, plain text otherwise. Key: `${c.file}:${c.line}:${c.name}`;
    - when non-empty, `t("endpointsAffected")` followed by mono chips of `endpoints_affected`, then `t("cronsAffected")` followed by chips of `crons_affected`. Use length checks (`arr.length > 0 && …`), never `arr.length && …` (react-best-practices: conditional rendering).
  - **`styles.ts`:** per-key `… satisfies CSSProperties` objects, the same as `OverviewTab/styles.ts`. Do NOT spread a `CSSProperties`-annotated const (`client/INSIGHTS.md` TS2742 entry).
  - **UI primitives:** only from the `@devdigest/ui` barrel (`SectionLabel`, `Skeleton`, `ErrorState` — all already used by `PrBriefCard.tsx:7`). No new design-system components.
  - Each file stays under 200 lines.
- **Test** (`BlastRadiusBlock.test.tsx`):
  - Pattern: copy `PrBriefCard.test.tsx` — mocked global `fetch`, `QueryClientProvider` plus `NextIntlClientProvider locale="en" messages={{ blast: messages }}`, importing `messages/en/blast.json` by relative path. Use `fireEvent` / RTL queries; there is no `user-event` dependency (`client/INSIGHTS.md` 2026-09-18).
  - Three flow tests:
    1. **Happy path:** response with 2 downstream groups and an endpoint. Assert the stats text, both symbol names, and that a caller link `getByRole("link", { name: /Open src\/a.ts:12 on GitHub/ })` has `href` `https://github.com/acme/app/blob/deadbeef/src/a.ts#L12`. Assert there is no `role="status"`.
    2. **Empty:** `changed_symbols` has 1 entry, `downstream: []`, `degraded:false` → the `noDownstream` text renders and there is no list.
    3. **Degraded with callers:** `degraded:true, degraded_reason:'no_data'` and 1 group → the `role="status"` notice shows the `no_data` message AND the caller row still renders.
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`, `security`
- **Depends on:** Steps 5, 6
- **Done when:** `cd client && pnpm typecheck && pnpm test` pass, including the 3 new tests.

### Step 8 — Wire the block into the Overview tab  ·  [frontend]
- **Files:**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` (edit)
  - `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (edit: line 110 only)
- **Layer:** n/a
- **Interfaces:**
  - `OverviewTabProps` becomes `{ prBody: string | null | undefined; prId: string | null; repoFullName?: string | null; headSha?: string | null }`.
  - Inside the fragment, after the description section: `{prId && <BlastRadiusBlock prId={prId} repoFullName={repoFullName} headSha={headSha} />}`. Import it from `./_components/BlastRadiusBlock`.
  - `page.tsx:110` becomes `{tab === "overview" && <OverviewTab prBody={pr.body} prId={prId} repoFullName={repoFullName} headSha={pr.head_sha} />}`. This mirrors how `FindingsTab`/`DiffTab` already receive `repoFullName` and `headSha` (`page.tsx:121-122,138-139`).
- **Skills to invoke:** `next-best-practices`, `react-best-practices`, `react-frontend-best-practices`
- **Depends on:** Step 7
- **Done when:**
  - `cd client && pnpm typecheck && pnpm test && pnpm lint` pass.
  - On `/repos/<repoId>/pulls/<number>?tab=overview`, the "Blast radius" section renders below the description.
  - The Findings and Files tabs are unchanged.

### Step 9 — Make `get_blast_radius` real in `devdigest-mcp`  ·  [backend]
- **Files:**
  - `devdigest-mcp/src/api/endpoints.ts` (edit)
  - `devdigest-mcp/src/tools/get-blast-radius.ts` (edit)
  - `devdigest-mcp/src/server.ts` (edit: `INSTRUCTIONS` line 18)
  - `devdigest-mcp/src/fixtures/blast-radius.mock.ts` (**delete**)
  - `devdigest-mcp/test/get-blast-radius.test.ts` (rewrite)
  - `devdigest-mcp/test/server.test.ts` (edit)
  - `devdigest-mcp/specs/tool-contract.md` (edit: M8)
  - `devdigest-mcp/docs/tools.md` (edit: §`get_blast_radius`)
  - `devdigest-mcp/CLAUDE.md` (edit: lines 3, 49-50, 77)
  - `devdigest-mcp/README.md` (edit: lines 3, 55)
  - `devdigest-mcp/package.json` (edit: `description` only)
- **Layer:** n/a (separate package; HTTP client of the API)
- **Interfaces:**
  - **`endpoints.ts`:**
    - Add `BlastRadiusResponse` to the `import type { … } from '@devdigest/shared'` line. It resolves to the SERVER copy, so Step 1 must land first.
    - Interface: `getBlastRadius(prId: string): Promise<BlastRadiusResponse>; // GET  /pulls/:id/blast`.
    - Impl: `getBlastRadius: (prId) => http.get<BlastRadiusResponse>(`/pulls/${encodeURIComponent(prId)}/blast`)`.
  - **`get-blast-radius.ts`:**
    - Keep `import { z } from 'zod/v4'`; do not regress to `'zod'`.
    - Remove the fixture import.
    - **Input decision: DROP `changed_files`.** The route derives changed files server-side from `pr_files`, so the parameter can never influence the result. Keeping a "truly ignored" param would mislead the calling model (M10/M11 spirit), and removing it can't break M9. `getBlastRadiusInput = { pr_id }` only. `interface GetBlastRadiusArgs { pr_id: string }`.
    - Handler:
      ```ts
      export async function getBlastRadiusHandler(args: GetBlastRadiusArgs, deps: ToolDeps): Promise<CallToolResult> {
        let blast: BlastRadiusResponse;
        try { blast = await deps.api.getBlastRadius(args.pr_id); }
        catch (e) { return fromApiError(e, { entity: 'pull request', id: args.pr_id }); }
        const payload: Record<string, unknown> = { ...blast };
        if (blast.degraded) payload.note = `Repo index incomplete (${blast.degraded_reason ?? 'unknown'}) — callers may be partial and endpoints/crons unattributed; ask the user to re-sync the repo in the DevDigest UI, then call get_blast_radius again.`;
        else if (blast.downstream.length === 0) payload.note = 'No downstream callers found for the changed symbols — the change is locally contained as far as the index knows; proceed with run_agent_on_pr or get_findings.';
        return ok(payload);
      }
      ```
      The `note` text has the M11 form "<what> — <next step>".
    - `DESCRIPTION` = `'What else a PR could break: per changed symbol, its callers (file:line) and the HTTP endpoints / cron jobs reachable from them, read from DevDigest\'s repo index (no new analysis). Check degraded/degraded_reason — a degraded result may be incomplete.'`
    - Keep `annotations: { readOnlyHint: true }`.
  - **`server.ts:18`:** replace the line with `'get_blast_radius reads the repo index DevDigest built at clone time; if its result says degraded, treat it as possibly incomplete.'`.
  - **Delete `src/fixtures/blast-radius.mock.ts`.** Nothing else imports it (verified by Grep). Tests use inline fixtures, as `get-conventions.test.ts` does. If `src/fixtures/` is then empty, remove the folder.
  - **`test/get-blast-radius.test.ts`:** rewrite on the `get-conventions.test.ts:24-27` pattern (`{ getBlastRadius } as unknown as DevDigestApi`). Cases:
    1. Passes `pr_id` through and returns the payload plus no `note` when non-degraded with downstream.
    2. Degraded → `note` matches `/re-sync/`.
    3. Empty non-degraded → `note` matches `/No downstream callers/`.
    4. `DevDigestApiError('Pull request not found', 404)` → `isError`, and the text contains `not the GitHub PR number`.
  - **`test/server.test.ts`:**
    - Add `getBlastRadius: vi.fn(async () => ({ pr_id: 'pr1', changed_symbols: [], downstream: [], summary: '0 changed symbols · 0 callers · 0 endpoints · 0 cron jobs', degraded: false, degraded_reason: null }))` to the `fakeDeps` literal.
    - Replace the `'get_blast_radius returns the mock'` test with `'get_blast_radius calls the API and returns BlastRadiusResponse'`, asserting `payload.degraded === false` and `api.getBlastRadius` was called with the uuid.
    - The 5-tool and M9 tests stay as they are.
  - **Docs:**
    - **M8** becomes: "`get_blast_radius` calls `GET /pulls/:id/blast` only (read-only, no analysis in the MCP) and surfaces `degraded`/`degraded_reason` unchanged."
    - `docs/tools.md`: retitle the section to `## \`get_blast_radius\``, give it a one-param table (`pr_id`), a real example payload, the two notes, and the 404 error.
    - `CLAUDE.md`: line 49 becomes `get_blast_radius`. Drop the line-50 fixture row. Line 77 becomes "`get_blast_radius` is a thin pass-through of `GET /pulls/:id/blast` — no analysis here." Line 3 needs no change.
    - `README.md` and `package.json`: drop the word "mock".
- **Skills to invoke:** `zod`, `typescript-expert`, `security`
- **Depends on:** Steps 1, 4
- **Done when:**
  - `cd devdigest-mcp && pnpm typecheck && pnpm test` pass.
  - `grep -ri "mock" devdigest-mcp/src` finds no blast-radius hits.
  - No file under `devdigest-mcp/src` imports from top-level `'zod'`.

### Step 10 (OPTIONAL / P3 — skip for P1)  ·  [frontend]
These are stretch items. Implement them only if explicitly asked after P1 ships. Each is its own small plan:
- the collapsible tree view;
- the Tree/Graph toggle, which consumes the existing `view.tree`/`view.graph`/`graph.empty`/`graph.ariaLabel` keys;
- the "Prior PRs touching these files" block, which needs a new server read and is out of scope here.

---

## Contract changes
- **NEW `server/src/vendor/shared/contracts/blast.ts`** and the identical **NEW `client/src/vendor/shared/contracts/blast.ts`**:
  - `BlastDegradedReason` (z.enum of the 5 repo-intel reasons)
  - `BlastRadiusResponse = BlastRadius.extend({ pr_id, degraded, degraded_reason })`
- **`server/src/vendor/shared/index.ts`** and **`client/src/vendor/shared/index.ts`:** each gets `export * from './contracts/blast.js';` plus one docblock line.
- **`contracts/brief.ts` is NOT edited in either copy.** `BlastRadius`, `PrBrief` and the MCP's `satisfies BlastRadius` fixture (deleted in Step 9 anyway) are unaffected.
- **Recommendation recorded:** option (a), with structured `degraded`/`degraded_reason` fields, delivered through `.extend()` in a new file. The rationale is in Step 1.

## Database
None. There is no new table, column or migration. The feature is a pure read over existing `repo-intel` data (`symbols`, `references`, `file_rank`, `file_facts`, reached through `RepoIntelService`) plus `pull_requests`/`pr_files` through `container.reviewRepo`.

## Verification
1. `cd server && pnpm typecheck && pnpm test && pnpm arch`. The new `blast-helpers`, `blast-routes` and `contracts` cases must be green, with no NEW dependency-cruiser violation.
2. `cd client && pnpm typecheck && pnpm test && pnpm lint`. The 3 `BlastRadiusBlock` tests must be green.
3. `cd devdigest-mcp && pnpm typecheck && pnpm test`.
4. Shared drift check: `diff server/src/vendor/shared/contracts/blast.ts client/src/vendor/shared/contracts/blast.ts` prints nothing.
5. **Live API check.** Start the stack with `./scripts/dev.sh`. If the DB was pulled fresh, run `cd server && pnpm db:migrate` first. Import a real repo whose clone gets indexed (a TS repo — `repo-intel` indexes only `.ts/.tsx/.js/.jsx/.mjs/.cjs`, per `server/INSIGHTS.md` 2026-09-23).
   - **Test PR:** one that changes an exported function imported by ≥2 files. In this repo, for example, edit `taskLine` in `server/src/modules/reviews/helpers.ts:82`, or an export of `client/src/components/diff-viewer/helpers.ts`. Import that PR.
   - `curl -s http://localhost:3001/repos/<repoId>/index-state` should show `status` `full` (or `partial`) and `degraded` falsy. If `degraded: true`, expect the blast response below to be degraded too.
   - `curl -s http://localhost:3001/pulls/<prUuid>/blast` should return 200 with a `BlastRadiusResponse`:
     - the changed function appears in `changed_symbols`;
     - `downstream[0].symbol` is that function, with ≥2 `callers` entries of `{name,file,line}`;
     - `degraded:false`, `degraded_reason:null`;
     - `summary` like `"N changed symbols · M callers · …"`.
   - `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/pulls/00000000-0000-0000-0000-000000000000/blast` should print `404`.
6. **UI check.** Open `http://localhost:3000/repos/<repoId>/pulls/<number>?tab=overview`.
   - The "Blast radius" section shows the stats line and the symbol → callers list.
   - Clicking a caller opens `github.com/<owner>/<repo>/blob/<head_sha>/<file>#L<line>` in a new tab.
   - On a PR whose repo has no persistent index (e.g. the seeded demo repo), the "Index incomplete" notice appears.
7. **MCP check.** Run `cd devdigest-mcp && pnpm inspect` and call `get_blast_radius` with `{ "pr_id": "<prUuid>" }`. It should return the same JSON as step 5, with no `[MOCK]` anywhere. The `changed_files` param is no longer listed.
8. Run `pr-self-review` before any push or PR.

## Risks / open questions
- **Global caller cap (Step 2/7, display):** `tryPersistentBlast` applies `MAX_CALLERS_PER_SYMBOL` (20) to the WHOLE caller list (`service.ts:386`), not per symbol. The ripgrep fallback has no cap at all. A PR touching many hot symbols may show callers for only the top-ranked few. This is a repo-intel fix and is NOT planned here.
- **Degraded path loses endpoint attribution (Step 2):** without `factsByFile`, the facade's flat `impactedEndpoints` can't be attributed to a symbol, so `endpoints_affected` is `[]` on that path. The degraded notice text says so. Exposing the flat list (e.g. an `unattributed_endpoints` field) is a possible follow-up, not planned.
- **"Degraded" on the fallback even when results exist (Step 7):** the facade hard-codes `reason:'no_data'` on the ripgrep path (`service.ts:301-302`), which is why the notice renders alongside results. Expect reviewers to see it on every non-indexed repo.
- **Same-name symbols collapse (Step 2):** callers carry only `viaSymbol` (a name, not name+file). Two changed files that both export `helpers` merge into one `downstream` group. This is inherent to `BlastCallerRow`.
- **Enum drift (Step 1):** `BlastDegradedReason` duplicates repo-intel's `DegradedReason`. The `BlastFacadeResult` annotation in Step 3 turns a widening into a typecheck error rather than a runtime serializer 500, but the two lists still need a manual sync.
- **Placement vs `PrBriefCard` (Step 8):** `PrBriefCard.tsx:2-3` says "L05 adds Blast/Risks/History blocks" there, and that card renders on both the Overview and Findings tabs. This request explicitly targets the Overview tab via `OverviewTab`. If L05 later moves the block into the brief card, `BlastRadiusBlock` is self-contained and can be re-parented without changes.
- **Cost of the fallback read (Step 4):** on a non-indexed repo, `getBlastRadius` scans `codeIndex.symbols` and re-reads caller files from the clone on every GET. There is no rate limit (unlike `POST /pulls/:id/intent`). React Query caches per `prId`, so it is acceptable for P1. Revisit if it shows up in latency.
- **No e2e coverage:** the e2e stack's seeded repo has no repo-intel index, so only the degraded branch would be exercised. Not planned.
- **Not planned (adjacent):** surfacing blast in the review prompt; feeding `PrBrief.blast`; using `useRepoIntelStatus` to offer a "Re-sync" CTA inside the block.

## Do-not-touch confirmations
- **`server/src/db/migrations/**` and `meta/_journal.json`:** untouched. No schema change and no `pnpm db:generate`.
- **`client/src/vendor/ui/**`:** untouched. The block uses only existing barrel exports (`SectionLabel`, `Skeleton`, `ErrorState`) from `@devdigest/ui`.
- **`server/src/vendor/shared/**` and `client/src/vendor/shared/**`:** edited only additively (one new file each plus one barrel line each), in lockstep, server first. `brief.ts` is not modified.
- **`server/src/modules/repo-intel/**`:** not modified, and not imported by the new module (`no-cross-module-reach`). It is consumed only through `container.repoIntel`.
- **Lesson scaffolding:** the existing `blast.json` keys (`view.*`, `graph.*`) stay as they are even though P1 leaves them unused. The `pr_brief` table stays empty.
- **`server/clones/**`, `client/.next/**`, `**/test-results/**`, `skills-lock.json`:** not touched.
- **`devdigest-mcp`'s own "Do not touch" line (`CLAUDE.md:77`)** anticipated exactly this change: "only its handler body changes then". Step 9 updates that line to reflect the real tool.
