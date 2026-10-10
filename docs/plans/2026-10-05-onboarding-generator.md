# Plan — Onboarding Generator (SPEC-02 / L05)
**Spec:** `specs/SPEC-02-onboarding-generator.md` (verified in Step 0. No `[NEEDS CLARIFICATION]` markers. Six places where the spec and the repo disagree are resolved below under "Spec-vs-repo resolutions"; none of them contradicts an AC.)
**Request:** Wire generation, read, and regenerate endpoints for the existing `onboarding` table, `Onboarding` contract and `onboarding.system.md` prompt. Add the client page `/repos/:repoId/onboarding`, its sidebar entry and corrected i18n, plus a new deterministic e2e flow `09-…`.
**Status:** READY FOR IMPLEMENTER
**Packages touched:** server · client · e2e · shared (×2, one new file + barrel line each side)
**Out of scope:**
- Tour history/versioning, cost/token tracking, and any indexing/cloning triggered from this feature (spec Non-goals).
- "Share link" action. GitHub-issue-backed first tasks. Any new Settings UI.
- Any edit to `onboarding.system.md`, the `onboarding` table, the `Onboarding`/`OnboardingSection`/`OnboardingLink` schemas in `knowledge.ts`, or `FEATURE_MODELS`.
- Any edit to `client/src/vendor/ui/shell/**` (Sidebar/NavItem) or `client/src/vendor/ui/icons.tsx`.
- Fixing the Windows `file_edges` bug (`server/INSIGHTS.md` 2026-09-30), which makes `getCriticalPaths` always `[]` on Windows. It is noted as a risk only.
- Adding root README / `package.json` excerpts to the prompt facts. The spec lists exactly two fact sources.
- A concurrency guard on generate. Last write wins (spec Edge cases).

**Sources read:** `specs/SPEC-02-onboarding-generator.md` · `CLAUDE.md` · `INSIGHTS.md` · `server/CLAUDE.md` · `server/INSIGHTS.md` · `client/CLAUDE.md` · `client/INSIGHTS.md` · `e2e/CLAUDE.md` · `e2e/INSIGHTS.md` · `reviewer-core/CLAUDE.md` · `specs/review-flow.md` (P1–P3, C1, C4) · `server/specs/api-contract.md` · `client/specs/ui-flows.md` · `e2e/specs/README.md` · `server/src/db/schema/context.ts` · `server/src/vendor/shared/contracts/knowledge.ts` (+ client copy, identical for Onboarding) · `server/src/vendor/shared/contracts/platform.ts` · `server/src/vendor/shared/index.ts` (+ client copy) · `server/src/prompts/onboarding.system.md` · `server/src/platform/prompts.ts` · `server/src/platform/errors.ts` · `server/src/platform/resilience.ts` · `server/src/platform/container.ts` · `server/src/modules/index.ts` · `server/src/modules/repo-intel/{types,routes,service}.ts` · `server/src/modules/settings/feature-models.ts` · `server/src/modules/intent/{repository,service}.ts` · `server/src/modules/conventions/{routes,service,extractor,repository,constants}.ts` · `server/src/modules/context/{routes,service,scanner,helpers,constants}.ts` · `server/test/conventions.it.test.ts` · `server/src/adapters/mocks.ts` · `reviewer-core/src/index.ts` · `reviewer-core/src/prompt.ts` · `client/src/vendor/ui/nav.ts` · `client/src/vendor/ui/shell/NavItem.tsx` · `client/src/vendor/ui/icons.tsx` · `client/src/components/app-shell/helpers.ts` · `client/src/lib/feature-models.ts` · `client/src/lib/hooks/{context,conventions,repo-intel,index}.ts` · `client/src/lib/api.ts` · `client/src/i18n/request.ts` · `client/messages/en/onboarding.json` · `client/src/app/repos/[repoId]/context/{page.tsx,_hooks/useContextPage.ts,_components/DocViewer/*,_components/IndexStatusLine/*}` · `client/src/components/mermaid-diagram/MermaidDiagram.tsx` · `e2e/specs/08-pr-findings-column.flow.json` · `.claude/skills/*/SKILL.md` (inventory).

## Context

**Already in place (consume it, do not recreate it):**
- **Table** `onboarding` at `server/src/db/schema/context.ts:120-126`: `repoId` (uuid PK, FK `repos.id` `ON DELETE CASCADE`), `json` (jsonb, not null), `generatedAt` (timestamptz, default now). The migration already exists (`0000_init.sql`), and `t.onboarding` is exported from `server/src/db/schema.ts:75`. **No migration.**
- **Contracts** `OnboardingLink {label,path}`, `OnboardingSection {kind: string, title, body (md), diagram: string.nullish(), links}`, `Onboarding {sections}` at `server/src/vendor/shared/contracts/knowledge.ts:28-47`. The client copy is identical. These are not edited.
- **Prompt** `server/src/prompts/onboarding.system.md`. It has two **caller-filled** placeholders, `{{sections}}` (line 4) and `{{language}}` (line 42), rendered by `renderPrompt(name, vars)` in `server/src/platform/prompts.ts:40`. It caps `links` at "up to 4" per section, allows a `diagram` only for `architecture`/`routes_and_apis`, and carries its own `<untrusted>` SECURITY rule. Nothing calls it today.
- **Feature-model registry**: the `'onboarding'` entry exists in `FEATURE_MODELS` (`server/src/vendor/shared/contracts/platform.ts:46-52`, default `openrouter` / `deepseek/deepseek-v4-flash`) and in `client/src/lib/feature-models.ts:14-20`. Settings → Feature Models already lists it.
- **repo-intel facade** (`server/src/modules/repo-intel/types.ts:137-172`, reached through `container.repoIntel`): `getIndexState`, `getRepoMap(repoId, tokenBudget?)`, `getTopFilesByRank(repoId, n, opts?)`, `getCriticalPaths(repoId): string[][]`. `getIndexState` for a repo with no row returns `status: 'degraded'`, `reason: 'no_data'` (`service.ts:189-205`). The seeded demo repo is in this state, which is what the e2e flow relies on.
- **Project Context**: `container.contextService` (`ContextService`, a Container singleton with an in-memory per-repo scan cache, `server/src/modules/context/service.ts:32-79`). `listDocuments` returns metadata only, never content. `capProjectContext` / `MAX_PROJECT_CONTEXT_CHARS` (24 000) and `wrapUntrusted` are exported from `@devdigest/reviewer-core` (`reviewer-core/src/index.ts:15-24`). `formatContextEntry` lives in `context/helpers.ts:71`.
- **Client scaffolding**: `client/messages/en/onboarding.json` (namespace auto-loaded by `client/src/i18n/request.ts`; `generate.body` is stale). `activeKeyFor` already maps `pathname.includes("/onboarding")` → `"onboarding-tour"` (`client/src/components/app-shell/helpers.ts:29`). `MermaidDiagram` is at `client/src/components/mermaid-diagram`. `Markdown`, `Drawer`, `Tabs`, `Card`, `Button`, `EmptyState`, `ErrorState`, `Skeleton` come from the `@devdigest/ui` barrel. `useRepoIntelStatus(repoId)` (`client/src/lib/hooks/repo-intel.ts:31`) reads `GET /repos/:id/index-state`.

**Missing:** an `onboarding` server module, the routes, a client route folder `client/src/app/repos/[repoId]/onboarding/` (does not exist), a NAV entry, client hooks, and an e2e flow.

**Name collision to respect:** `/onboarding` (no repo prefix) is the existing **add-repository** page (`client/src/app/onboarding/page.tsx`, e2e `06-onboarding.flow.json`). With today's `activeKeyFor`, that page would light up the new "Onboarding Tour" nav item. Step 11 tightens the match.

### Spec-vs-repo resolutions (decided here; implement exactly as written)
1. **`resolveFeatureModel(container, workspaceId, 'onboarding')` cannot be imported.** It lives in `server/src/modules/settings/feature-models.ts`, and importing it from another module breaks `no-cross-module-reach`. Follow the established intent/conventions pattern instead (`intent/repository.ts:22-35`, `intent/service.ts:231-234`): a repository-local `featureModelOverride(workspaceId)` reads `settings.key = 'feature_models'`, and the service falls back to `FEATURE_MODELS.find(f => f.id === 'onboarding')`. The behaviour is identical: an override applies, otherwise the registry default.
2. **AC-7/8/9/10 need per-item rows, but the contract only has `body` + `links`.** Items are mapped onto the existing `links` array, with per-kind formatting instructions supplied through the caller-owned `{{sections}}` placeholder. The prompt file stays unchanged.
   - `critical_paths`: one link per row. `path` is the file; `label` is the one-line reason.
   - `reading_path`: links in reading order. `label` is the one-line rationale.
   - `first_tasks`: links. `label` is the task; `path` is the file or directory pointer.
   - `how_to_run`: commands go in one fenced code block in `body`. The client extracts them line by line.
   - The prompt's "up to 4 links" rule caps `first_tasks` at **3–4 entries**. That range sits inside AC-10's "3–5", so the prompt does not have to change (see Risks).
3. **AC-3/AC-12 need `generatedAt`, and AC-14 needs a limited-data flag. Neither is in `Onboarding`.** Add a **new** contract file `contracts/onboarding.ts` holding an `OnboardingTour` envelope that wraps the unchanged `Onboarding`. This follows the "extend with new files" rule, and `knowledge.ts` is not edited. `limited_data` is **derived on every read** from the current repo-intel facts through one pure helper, because the `json` column stores exactly the `Onboarding` object.
4. **AC-7 "Open" cannot reuse `GET /repos/:id/context/file`.** That route rejects any path that is not `.md` under a context root (`context/service.ts:86`, `isAttachablePath`), and critical paths are source files. Add `GET /repos/:id/onboarding/file?path=`, which serves only paths that appear in the stored tour's `links`, behind a clone-escape guard. The client copies the Project Context preview/raw pane **pattern** (Tabs + `Markdown`/`<pre>`) inside a `Drawer`.
5. **AC-13 "sidebar nav item label via i18n".** The vendored `NavItem` renders `item.label` literally (`client/src/vendor/ui/shell/NavItem.tsx:54`), and every NAV label is a literal. Changing that means editing `vendor/ui/shell/**` (Do not touch). The plan adds `onboarding.json` → `"nav": "Onboarding Tour"` and sets the NAV literal to the identical string. The page title, section titles and empty-state copy are fully i18n-driven. Listed under Open questions.
6. **The 409 code is the planner's choice.** Use HTTP `409`, `code: "index_not_ready"`, `details: { index_status }`, thrown as `new AppError('index_not_ready', …, 409, …)` from the existing `server/src/platform/errors.ts`. No new error class.

## Steps

### Step 1 — Add the `OnboardingTour` contract (both vendored copies)  ·  [full-stack]
- **Files:** `server/src/vendor/shared/contracts/onboarding.ts` (new) · `client/src/vendor/shared/contracts/onboarding.ts` (new, byte-identical) · `server/src/vendor/shared/index.ts` (edit: add `export * from './contracts/onboarding.js';` after the `project-context.js` line, and add a line to the header doc comment) · `client/src/vendor/shared/index.ts` (same edit)
- **Layer:** n/a (shared contracts)
- **Interfaces:**
  ```ts
  import { z } from 'zod';
  import { Onboarding } from './knowledge.js';
  export const OnboardingSectionKind = z.enum(['architecture','critical_paths','how_to_run','reading_path','first_tasks']);
  export type OnboardingSectionKind = z.infer<typeof OnboardingSectionKind>;
  export const OnboardingTourStatus = z.enum(['ready','not_generated']);
  export type OnboardingTourStatus = z.infer<typeof OnboardingTourStatus>;
  /** GET /repos/:id/onboarding and POST /repos/:id/onboarding/generate. */
  export const OnboardingTour = z.object({
    repo_id: z.string(),
    status: OnboardingTourStatus,
    tour: Onboarding.nullable(),          // null iff status === 'not_generated'
    generated_at: z.string().nullable(),  // ISO; null iff not_generated
    limited_data: z.boolean(),            // AC-14; false when not_generated
  });
  export type OnboardingTour = z.infer<typeof OnboardingTour>;
  /** `details` of the 409 index_not_ready error envelope (AC-4). */
  export const OnboardingIndexNotReady = z.object({
    index_status: z.enum(['full','partial','degraded','failed']),
  });
  export type OnboardingIndexNotReady = z.infer<typeof OnboardingIndexNotReady>;
  ```
  Do **not** touch `knowledge.ts`.
- **Skills to invoke:** `zod`, `typescript-expert`
- **Depends on:** nothing
- **Done when:** both files exist and are identical (`diff` shows nothing), both barrels export them, and `pnpm typecheck` passes in `server/` and `client/`.

### Step 2 — Onboarding module: constants, types, pure helpers  ·  [backend]
- **Files:** `server/src/modules/onboarding/constants.ts` (new) · `server/src/modules/onboarding/types.ts` (new) · `server/src/modules/onboarding/helpers.ts` (new)
- **Layer:** domain (no imports of fastify, drizzle, adapters, Container, db, fs, or reviewer-core. `no-domain-outward`)
- **Interfaces:**
  - `constants.ts` (no imports except types):
    - `ONBOARDING_PROMPT_FILE = 'onboarding.system.md'`
    - `ONBOARDING_SCHEMA_NAME = 'OnboardingTour'`
    - `ONBOARDING_LANGUAGE = 'English'`
    - `FEATURE_MODELS_SETTING_KEY = 'feature_models'`
    - `FEATURE_MODEL_ID = 'onboarding' as const`
    - `SECTION_ORDER = ['architecture','critical_paths','how_to_run','reading_path','first_tasks'] as const`
    - `DIAGRAM_SECTION_KINDS = ['architecture'] as const`
    - `MAX_LINKS_PER_SECTION = 4` (mirrors the prompt's rule)
    - `TOP_FILES_COUNT = 15`
    - `ONBOARDING_TIMEOUT_MS = 120_000`, `ONBOARDING_MAX_REPAIRS = 1`, `ONBOARDING_MAX_TOKENS = 6_000`, `ONBOARDING_TEMPERATURE = 0.2`
    - `LIMITED_MIN_FILES_INDEXED = 10`, `LIMITED_MIN_TOP_FILES = 5`
    - `ONBOARDING_MAX_FILE_BYTES = 1_000_000`
    - `SECTIONS_SPEC: string`, the text substituted into `{{sections}}`. It is a numbered list of the 5 kinds in `SECTION_ORDER`, each with its formatting contract:
      - `architecture`: overview body plus one `flowchart` diagram, and up to 4 key-file links.
      - `critical_paths`: a short intro body. Each link is one critical file; `label` is ONE line on why it matters; paths only from the CRITICAL PATHS / TOP FILES facts. `diagram: null`.
      - `how_to_run`: the body MUST contain exactly one fenced code block with one shell command per line, taken only from the provided context documents. If none are grounded, say so in prose and emit no code block. `links: []` or config files. `diagram: null`.
      - `reading_path`: links in the order to read them, from TOP FILES; `label` is a one-line rationale. `diagram: null`.
      - `first_tasks`: 3 to 4 links; `label` is a short starter task; `path` is a real file or directory from the facts. `diagram: null`.
      - Every section's `kind` must be exactly the snake_case id.
  - `types.ts`:
    ```ts
    export interface OnboardingFacts {
      repoFullName: string;
      indexStatus: 'full' | 'partial' | 'degraded' | 'failed';
      filesIndexed: number;
      repoMapText: string;          // '' when degraded
      criticalPaths: string[][];
      topFiles: string[];
      contextEntries: string[];     // already capped `Source: <path>\n\n<content>` entries
      contextTruncated: boolean;
    }
    export interface StoredTour { onboarding: Onboarding; generatedAt: Date }
    ```
  - `helpers.ts` (all pure and exported):
    - `isLimitedData(i: { filesIndexed: number; criticalPathCount: number; topFileCount: number }): boolean`. Returns `filesIndexed < LIMITED_MIN_FILES_INDEXED || (criticalPathCount === 0 && topFileCount < LIMITED_MIN_TOP_FILES)`.
    - `formatCriticalPaths(paths: string[][]): string`. One chain per line, `a → b → c`, or `'(none)'`.
    - `formatTopFiles(paths: string[]): string`. A numbered list, or `'(none)'`.
    - `normalizeLinkPath(p: string): string`. Trims, strips surrounding backticks, a leading `./` and a leading `/`.
    - `normalizeTour(draft: { sections: Array<{ kind: string; title: string; body: string; diagram: string | null; links: { label: string; path: string }[] }> }): Onboarding | null`:
      - Picks the FIRST section per kind and emits them in `SECTION_ORDER`.
      - Returns `null` if any of the 5 kinds is missing.
      - Forces `diagram` to `null` unless the kind is in `DIAGRAM_SECTION_KINDS` and the trimmed diagram is non-empty.
      - Strips a leading ```` ```mermaid ```` / ```` ``` ```` fence from the diagram.
      - Normalizes each link path, drops links whose path is empty after normalization, and slices to `MAX_LINKS_PER_SECTION`.
      - Ends with `Onboarding.parse(...)`.
    - `tourLinkPaths(o: Onboarding): Set<string>`. All normalized link paths across all sections.
    - `isSafeRelPath(p: string): boolean`. Rejects an empty path, `\`, a leading `/`, a drive letter (`/^[A-Za-z]:/`), and any `..`/`.`/empty segment.
    - `toTourDto(repoId: string, stored: StoredTour | null, limited: boolean): OnboardingTour`.
- **Skills to invoke:** `onion-architecture`, `typescript-expert`, `zod`
- **Depends on:** Step 1
- **Done when:** `server/test/onboarding-helpers.test.ts` (Step 8) passes. `pnpm arch` shows no new violation for these three files.

### Step 3 — Onboarding repository  ·  [backend]
- **Files:** `server/src/modules/onboarding/repository.ts` (new)
- **Layer:** persistence
- **Interfaces:** `export class OnboardingRepository { constructor(private db: Db) }` with the methods below. Model it on `conventions/repository.ts:40-50,165-178`; import `Db` from `../../db/client.js` and `* as t` from `../../db/schema.js`.
  - `getRepo(workspaceId: string, repoId: string): Promise<{ id: string; fullName: string; clonePath: string | null } | undefined>`. Scoped by `t.repos.workspaceId` AND `t.repos.id`.
  - `getTour(repoId: string): Promise<StoredTour | null>`. Selects from `t.onboarding`. Runs `Onboarding.safeParse(row.json)`; an unparseable row returns `null`, i.e. it is treated as not generated.
  - `upsertTour(repoId: string, onboarding: Onboarding): Promise<StoredTour>`. Inserts `{ repoId, json: onboarding, generatedAt: new Date() }`, then `.onConflictDoUpdate({ target: t.onboarding.repoId, set: { json, generatedAt } })`, then `.returning()`.
  - `featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined>`. A copy of `intent/repository.ts:22-35`, using `FEATURE_MODELS_SETTING_KEY` / `FEATURE_MODEL_ID` from `./constants.js`. Keep the docblock line explaining why it is local (`no-cross-module-reach`).
- **Skills to invoke:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`
- **Depends on:** Step 2
- **Done when:** it typechecks. The it-test in Step 8 shows that a second generate overwrites the single row, with exactly 1 row per repo.

### Step 4 — Expose Project Context documents for prompt use  ·  [backend]
- **Files:** `server/src/modules/context/service.ts` (edit, additive)
- **Layer:** application
- **Interfaces:** add a public method to `ContextService`:
  ```ts
  /** Onboarding (SPEC-02): the repo's scanned documents, as capped prompt entries. Serves from the same scan cache as GET /repos/:id/context. Never throws for a missing clone — returns empty. */
  async promptDocuments(workspaceId: string, repoId: string): Promise<{ entries: string[]; paths: string[]; truncated: boolean }>
  ```
  Implementation:
  1. Resolve the repo row with `this.repo.getRepo`. If it is missing, throw `NotFoundError('Repository not found')`.
  2. If there is no `clonePath`, or `!(await cloneDirExists(...))`, return `{ entries: [], paths: [], truncated: false }`.
  3. Otherwise use the cache exactly as `listDocuments` does. Extract a private `scanCached(repoId, clonePath, rescan = false)` that both methods call, so cache behaviour stays identical.
  4. Map each doc to `formatContextEntry(doc.path, doc.content)`, apply `capProjectContext(entries)`, and set `paths = docs.slice(0, capped.specs.length).map(d => d.path)`.
  5. Return `{ entries: capped.specs, paths, truncated }`.
  - Do not change `listDocuments`' observable output.
- **Skills to invoke:** `onion-architecture`, `typescript-expert`
- **Depends on:** nothing
- **Done when:** `server/test/context.it.test.ts` still passes unchanged, and the onboarding it-test (Step 8) shows a context doc's path inside the LLM user message.

### Step 5 — Generator (prompt assembly + the single LLM call)  ·  [backend]
- **Files:** `server/src/modules/onboarding/generator.ts` (new)
- **Layer:** application. Same shape as `conventions/extractor.ts`: imports `@devdigest/reviewer-core`, `../../platform/prompts.js`, `../../platform/resilience.js`, `../../platform/errors.js`, and the `Container` type. It does not import `adapters/`.
- **Interfaces:**
  - `export const OnboardingDraftSchema = z.object({ sections: z.array(z.object({ kind: OnboardingSectionKind, title: z.string(), body: z.string(), diagram: z.string().nullable(), links: z.array(z.object({ label: z.string(), path: z.string() })) })) })`. Every field is required and `diagram` is `.nullable()`, not `.nullish()`. Strict json_schema mode does not honour optionals (see the `conventions/extractor.ts:28-32` comment). Do NOT pass the shared `Onboarding` schema to the model.
  - `export function buildUserMessage(f: OnboardingFacts): string`. Sections are joined by blank lines, and every repo-derived string goes through `wrapUntrusted` (spec Untrusted inputs; review-flow P2):
    - `## Repository` (repo full name, plain)
    - `## FACTS — index` (status, filesIndexed, plain numbers)
    - `## Repo map` → `wrapUntrusted('repo-map', f.repoMapText || '(unavailable)')`
    - `## Critical paths` → `wrapUntrusted('critical-paths', formatCriticalPaths(...))`
    - `## Top files by rank` → `wrapUntrusted('top-files', formatTopFiles(...))`
    - `## Project context` → each entry `wrapUntrusted('context:<path>', entry)`, or `'(none)'`, plus a note when `contextTruncated`
    - A closing instruction: "Write the tour. Use only paths that appear above."
  - `export async function generateTour(container: Container, input: { facts: OnboardingFacts; choice: FeatureModelChoice }): Promise<Onboarding>`:
    1. `system = await renderPrompt(ONBOARDING_PROMPT_FILE, { sections: SECTIONS_SPEC, language: ONBOARDING_LANGUAGE })`.
    2. `llm = await container.llm(choice.provider)`. Let a `ConfigError` (missing key) propagate unchanged.
    3. `res = await withTimeout(llm.completeStructured({ model, schema: OnboardingDraftSchema, schemaName: ONBOARDING_SCHEMA_NAME, messages: [system, user], temperature, maxTokens, timeoutMs: ONBOARDING_TIMEOUT_MS, maxRetries: ONBOARDING_MAX_REPAIRS, sessionId: `${repoFullName}:onboarding` }), ONBOARDING_TIMEOUT_MS)`. The outer `withTimeout` is load-bearing because `OpenRouterProvider` ignores `timeoutMs` (`server/INSIGHTS.md` 2026-09-23).
    4. Wrap any non-`ConfigError` throw in `ExternalServiceError(\`${provider}/${model}: ${msg}\`)`. Append the remedy " — pick a faster model for \"Onboarding Tour\" in Settings → Feature Models" when the message matches `/timed out/i`.
    5. `const tour = normalizeTour(res.data)`. If it is `null`, throw `ExternalServiceError('The model did not return all 5 onboarding sections')`. Return `tour`.
- **Skills to invoke:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Depends on:** Steps 2, 4
- **Done when:** the it-test's mock LLM receives `schemaName === 'OnboardingTour'`, and a fixture missing a section produces a 502 with no row written.

### Step 6 — Clone file reader (for the in-app viewer)  ·  [backend]
- **Files:** `server/src/modules/onboarding/reader.ts` (new)
- **Layer:** infrastructure-in-module (fs only, same shape as `context/scanner.ts`; duplicated on purpose because importing `../context/scanner.js` breaks `no-cross-module-reach`)
- **Interfaces:**
  - `cloneDirExists(clonePath: string): Promise<boolean>`
  - `safeJoin(clonePath: string, relPath: string): string | null`, copied from `context/scanner.ts:29-34`
  - `statSourceFile(clonePath, relPath): Promise<{ size: number; updatedAt: string } | null>`. Returns `null` unless `isFile()`.
  - `readSourceFile(clonePath, relPath): Promise<string | null>`. Returns `null` when the file is unreadable or contains `\u0000` (binary).
- **Skills to invoke:** `onion-architecture`, `security`
- **Depends on:** nothing
- **Done when:** the it-test traversal case (`path=../outside.txt`) returns 422, and `safeJoin` returning `null` never reaches `readFile`.

### Step 7 — Service + routes + module registration  ·  [backend]
- **Files:** `server/src/modules/onboarding/service.ts` (new) · `server/src/modules/onboarding/routes.ts` (new) · `server/src/modules/index.ts` (edit: `import onboarding from './onboarding/routes.js';` plus an `onboarding,` entry after `context`)
- **Layer:** application (service) · presentation (routes)
- **Interfaces:**
  - `export class OnboardingService { constructor(private container: Container) { this.repo = new OnboardingRepository(container.db); } }`
    - `async get(workspaceId, repoId): Promise<OnboardingTour>`:
      1. `requireRepo` (404 `NotFoundError('Repository not found')`).
      2. `stored = await repo.getTour(repoId)`. If `!stored`, return `toTourDto(repoId, null, false)`.
      3. Otherwise compute `limited` via `this.limited(repoId)` and return `toTourDto(repoId, stored, limited)`.
    - `async generate(workspaceId, repoId): Promise<OnboardingTour>`:
      1. `requireRepo`.
      2. `state = await container.repoIntel.getIndexState(repoId)`. If `state.status !== 'full'`, throw `new AppError('index_not_ready', 'Indexing has not finished for this repository — the onboarding tour can be generated once it is fully indexed.', 409, { index_status: state.status })` (AC-4). Make no LLM call.
      3. Gather facts with `Promise.all`:
         - `getRepoMap(repoId)`. Call it with **no** token budget: the cache is keyed by budget (`repo-intel/service.ts:412`), so a custom budget misses it. Use `text`, or `''` when degraded.
         - `getCriticalPaths(repoId)`
         - `getTopFilesByRank(repoId, TOP_FILES_COUNT)`
         - `container.contextService.promptDocuments(workspaceId, repoId)`
         Each repo-intel read gets `.catch(() => <empty>)`.
      4. Model: `override = await repo.featureModelOverride(workspaceId)`, `def = FEATURE_MODELS.find(f => f.id === FEATURE_MODEL_ID)!`, `choice = override ?? { provider: def.defaultProvider, model: def.defaultModel }`.
      5. `onboarding = await generateTour(container, { facts, choice })`. If it throws, the row is never touched (AC-11).
      6. `stored = await repo.upsertTour(repoId, onboarding)` (AC-5, AC-12).
      7. Return `toTourDto(repoId, stored, isLimitedData({ filesIndexed: state.filesIndexed, criticalPathCount: criticalPaths.length, topFileCount: topFiles.length }))`.
    - `async readFile(workspaceId, repoId, path): Promise<SpecFile>`:
      1. `requireRepo`.
      2. If `!isSafeRelPath(path)`, throw `ValidationError('Unsafe path')` (422).
      3. `stored = getTour`. If it is missing, or `!tourLinkPaths(stored.onboarding).has(normalizeLinkPath(path))`, throw `NotFoundError('File is not part of this onboarding tour')`.
      4. If the clone is missing, throw `ValidationError('The local clone for this repository is not ready')`.
      5. `stat`. A missing file is a 404. `size > ONBOARDING_MAX_FILE_BYTES` is a 422 `'File is too large to preview'`.
      6. `read`. `null` is a 404.
      7. Return `{ path, content, size, updated_at }` (the `SpecFile` contract from `platform.ts:259`).
    - `private async limited(repoId)`: reads `getIndexState`, `getCriticalPaths`, `getTopFilesByRank(repoId, TOP_FILES_COUNT)` (each `.catch`-guarded) and returns `isLimitedData(...)`.
  - `routes.ts`: `export default async function onboardingRoutes(appBase: FastifyInstance)`. Use `withTypeProvider<ZodTypeProvider>()` and `const service = new OnboardingService(app.container)`. Each handler is one `getContext` call plus one service call (pattern: `conventions/routes.ts`).
    - `GET /repos/:id/onboarding` (`params: IdParams`) → `service.get`
    - `POST /repos/:id/onboarding/generate` (`params: IdParams`, `config: { rateLimit: { max: 6, timeWindow: '1 minute' } }`) → `service.generate`. No body; the client sends none (`client/INSIGHTS.md` 2026-09-16 body-less POST).
    - `GET /repos/:id/onboarding/file` (`params: IdParams`, `querystring: z.object({ path: z.string().min(1).max(1024) })`) → `service.readFile`
    - File header docblock lists the three routes, as in `context/routes.ts:9-19`.
- **Skills to invoke:** `fastify-best-practices`, `security`, `onion-architecture`, `typescript-expert`
- **Depends on:** Steps 3, 4, 5, 6
- **Done when:** `pnpm arch` reports no new violations. In particular, `service.ts` imports nothing from `../context/`, `../settings/` or `adapters/`. All Step 8 it-cases pass.

### Step 8 — Server tests  ·  [backend]
- **Files:** `server/test/onboarding-helpers.test.ts` (new, hermetic) · `server/test/onboarding.it.test.ts` (new; DB-backed, so it MUST carry the `.it.test.ts` suffix)
- **Layer:** n/a
- **Interfaces / cases:**
  - Helpers:
    - `normalizeTour` reorders shuffled sections into `SECTION_ORDER`.
    - It returns `null` when a kind is missing.
    - It nulls `diagram` on non-architecture kinds and strips a mermaid fence.
    - It caps links at 4 and normalizes `./src/a.ts` / `` `src/a.ts` `` to `src/a.ts`.
    - `isLimitedData` boundaries: filesIndexed 9 → true; 455 files with 0 critical paths and 15 top files → false (the Windows no-edges case must NOT trip it); 50 files, 0 paths, 2 top files → true.
    - `isSafeRelPath` rejects `../x`, `/etc/passwd`, `C:/x`, `a\\b`, `a//b`, and accepts `src/app.ts`.
    - `tourLinkPaths`.
  - It-test: follow `server/test/conventions.it.test.ts:73-136`.
    - Setup: `startPg`, `seed`, a temp clone with `src/app.ts` and `docs/guide.md`, and `acme/payments-api` updated to point `clonePath` at it.
    - `repoIntel` stub implementing `getIndexState`, `getRepoMap`, `getCriticalPaths`, `getTopFilesByRank` with a configurable status and arrays.
    - Overrides: `secrets: new MockSecretsProvider({ OPENROUTER_API_KEY: 'sk-test' })` and `llm: { openrouter: new MockLLMProvider('openrouter', { structuredBySchema: { OnboardingTour: FIXTURE } }) }`. FIXTURE holds the 5 sections and links to `src/app.ts`.
    - Cases:
      1. GET before any generate → 200 `{ status: 'not_generated', tour: null, generated_at: null, limited_data: false }`.
      2. POST with stub status `'partial'` → 409, `error.code === 'index_not_ready'`, `details.index_status === 'partial'`, and 0 rows in `t.onboarding`.
      3. POST with `'full'` → 200 `status: 'ready'`, sections in the fixed order, 1 row, `generated_at` set.
      4. POST again with a fixture that fails `OnboardingDraftSchema` → 502, and the stored `json`/`generatedAt` are unchanged (AC-11).
      5. GET with the stub at `filesIndexed: 1` and empty arrays → `limited_data: true`.
      6. GET `/file?path=src/app.ts` → 200 with content.
      7. `?path=docs/guide.md` (not in the tour) → 404.
      8. `?path=../x` → 422.
      9. Unknown repo uuid → 404 on all three routes.
      10. The model override path: insert a `settings` row `feature_models: { onboarding: { provider: 'openai', model: 'x' } }` with an `llm.openai` mock, and assert that mock was called.
- **Skills to invoke:** `typescript-expert`, `drizzle-orm-patterns`
- **Depends on:** Step 7
- **Done when:** `cd server && pnpm exec vitest run onboarding` passes (with Docker). `pnpm exec vitest run --exclude '**/*.it.test.ts'` still passes without Docker.

### Step 9 — Client data hooks  ·  [frontend]
- **Files:** `client/src/lib/hooks/onboarding.ts` (new). Do not add it to the `hooks/index.ts` barrel; `conventions.ts` is not in it either, so import from `@/lib/hooks/onboarding`.
- **Layer:** n/a
- **Interfaces** (`"use client"`; `api` from `../api`; types only from `@devdigest/shared`):
  - `useOnboardingTour(repoId)` → `useQuery({ queryKey: ["onboarding", repoId], queryFn: () => api.get<OnboardingTour>(\`/repos/${repoId}/onboarding\`), enabled: !!repoId })`
  - `useGenerateOnboarding(repoId)` → `useMutation({ mutationFn: () => api.post<OnboardingTour>(\`/repos/${repoId}/onboarding/generate\`), onSuccess: (data) => { qc.setQueryData(["onboarding", repoId], data); qc.invalidateQueries({ queryKey: ["onboarding-file", repoId] }); }, onError: (err) => { if (err instanceof ApiError && err.code === "index_not_ready") qc.invalidateQueries({ queryKey: ["repo-intel-state", repoId] }); } })`
  - `useOnboardingFile(repoId, path)` → `useQuery({ queryKey: ["onboarding-file", repoId, path], queryFn: () => api.get<SpecFile>(\`/repos/${repoId}/onboarding/file?path=${encodeURIComponent(path!)}\`), enabled: !!repoId && !!path })`
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `security`, `typescript-expert`
- **Depends on:** Step 1
- **Done when:** `pnpm typecheck` passes, and no component calls `fetch` directly.

### Step 10 — i18n correction  ·  [frontend]
- **Files:** `client/messages/en/onboarding.json` (edit)
- **Layer:** n/a
- **Interfaces:** keep every existing key (`title`, `sections`, `sectionCount`, `regenerate`, `regenerating`, `unknownError`, `generate.{title,cta,generating}`, `loadError.title`).
  - **Replace** `generate.body` with: `"DevDigest reads the repo's index and its specs/docs, then writes a 5-section guided tour: architecture, critical paths, how to run locally, a guided reading path, and first tasks."`
  - **Add:**
    - `"nav": "Onboarding Tour"`
    - `"lastRefreshed": "Last refreshed {when}"`
    - `"sectionTitles": { "architecture": "Architecture", "critical_paths": "Critical paths", "how_to_run": "How to run locally", "reading_path": "Reading path", "first_tasks": "First tasks" }`
    - `"blocked": { "title": "Indexing hasn't finished", "body": "The onboarding tour is generated from the repository index, which is currently {status}. Generate becomes available once indexing completes." }`
    - `"limitedData": { "title": "Limited data", "body": "The index for this repository holds very few files, so this tour may be thin. Repo-intel indexes TypeScript/JavaScript sources only." }`
    - `"generateError": { "title": "Couldn't generate the onboarding tour" }`
    - `"retry": "Retry"`, `"open": "Open"`, `"copy": "Copy"`, `"copied": "Copied"`, `"collapse": "Collapse"`, `"expand": "Expand"`
    - `"noCommands": "No run commands could be grounded in this repository's documents."`
    - `"viewer": { "preview": "Preview", "raw": "Raw", "loadError": "Couldn't load this file" }`
- **Skills to invoke:** none beyond `next-best-practices` (namespace hygiene)
- **Depends on:** nothing
- **Done when:** the JSON parses, and the strings "overview", "key modules" and "conventions & gotchas" no longer appear in the file.

### Step 11 — Sidebar entry + active-key fix  ·  [frontend]
- **Files:** `client/src/vendor/ui/nav.ts` (edit; plain per-lesson data, precedent in `client/INSIGHTS.md` 2026-09-22) · `client/src/components/app-shell/helpers.ts` (edit) · `client/src/components/app-shell/helpers.test.ts` (new)
- **Layer:** n/a
- **Interfaces:**
  - In `NAV[0].items`, insert between `pulls` and `context`: `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Lightbulb", href: "/repos/:repoId/onboarding" }`.
    - The key MUST be `"onboarding-tour"` to match the existing `activeKeyFor` return.
    - No `gKey`. `g o` is free, but adding it means editing `SHORTCUTS` too, which is out of scope.
    - `Lightbulb` already exists in `icons.tsx:27`, so no icon edit.
  - `activeKeyFor`: replace line 29 with `if (/^\/repos\/[^/]+\/onboarding(\/|$)/.test(pathname)) return "onboarding-tour";` so the add-repository page `/onboarding` no longer highlights the tour item. Leave every other line alone.
- **Skills to invoke:** `react-frontend-best-practices`, `typescript-expert`, `react-testing-library` (for the helper test)
- **Depends on:** nothing
- **Done when:** `helpers.test.ts` asserts `activeKeyFor("/repos/abc/onboarding") === "onboarding-tour"`, `activeKeyFor("/onboarding") === ""`, `"/repos/abc/context"` → `"context"`, and `"/repos/abc/pulls"` → `"pulls"`. The sidebar shows Pull Requests → Onboarding Tour → Project Context.

### Step 12 — Route: page, orchestration hook, helpers, constants, styles  ·  [frontend]
- **Files:** all new under `client/src/app/repos/[repoId]/onboarding/`: `page.tsx` · `_hooks/useOnboardingPage.ts` · `constants.ts` · `helpers.ts` · `helpers.test.ts` · `styles.ts`
- **Layer:** n/a
- **Interfaces:**
  - `constants.ts`:
    - `export const SECTION_ORDER = ["architecture","critical_paths","how_to_run","reading_path","first_tasks"] as const satisfies readonly OnboardingSectionKind[];`. This is a type-only import; do NOT import the zod value (`client/INSIGHTS.md` 2026-09-22).
    - `export const FILE_PARAM = "file";`, `export const VIEWER_MODE_PARAM = "mode";`, `export type ViewerMode = "preview" | "raw";`, `export const DEFAULT_VIEWER_MODE: ViewerMode = "preview";`
  - `helpers.ts` (pure):
    - `extractCommands(body: string): string[]`. Collects the lines inside every fenced code block, trimmed, dropping empty lines and lines starting with `#`, and strips a leading `$ `. If there are no fences, falls back to list items whose entire content is one inline code span. Returns `[]` when nothing is found.
    - `orderedSections(tour: Onboarding): OnboardingSection[]`. Sorts by `SECTION_ORDER` index and drops unknown kinds.
    - `isMarkdownPath(p: string): boolean`
  - `useOnboardingPage(repoId)` returns:
    `{ tour, generatedAt, limitedData, status, indexStatus, indexReady, isLoading, isError, refetch, generate, generating, generateError, blockedByServer, openFile, closeFile, filePath, viewerMode, setViewerMode }`
    - It composes `useOnboardingTour`, `useGenerateOnboarding` and `useRepoIntelStatus(repoId)`.
    - `indexReady = indexState?.status === "full"`.
    - `blockedByServer = generateError instanceof ApiError && generateError.code === "index_not_ready"`.
    - `filePath` and `viewerMode` are read from and written to the URL (`?file=`, `?mode=`) via `router.replace`, mirroring `context/_hooks/useContextPage.ts:27-35`.
  - `page.tsx` (`"use client"`, thin layout; the shape follows `context/page.tsx`):
    - Wrap in `AppShell crumb={[{ label: t("title") }]}`, with the `useRepoNotFound` → `RepoNotFound` guard.
    - The header shows an `h1` with `t("title")` plus the repo short name. When there is a tour, the subtitle is `t("lastRefreshed", { when: format.dateTime(new Date(generatedAt), { dateStyle: "medium", timeStyle: "short" }) })`. Use `useFormatter().dateTime`, NOT `relativeTime`, because of the ENVIRONMENT_FALLBACK warning in `client/INSIGHTS.md` 2026-10-04.
    - When there is a tour, a `Button kind="secondary" icon="RefreshCw"` labelled `regenerate`/`regenerating`, with `disabled={!indexReady || generating}` and `loading={generating}`.
    - States, in order:
      1. Loading → `Skeleton`.
      2. GET error → `ErrorState title={t("loadError.title")} onRetry={refetch}`.
      3. Not ready (`!indexReady` or `blockedByServer`) → an inline notice block (`Icon` `AlertTriangle`) with `blocked.title` and `blocked.body` (`{status}` = index status). It shows above the content in either tour state. When `not_generated`, it is followed by a **disabled** `Button kind="primary"` with `generate.cta`.
      4. `not_generated` and `indexReady` → `EmptyState icon="Lightbulb" title={t("generate.title")} body={t("generate.body")} cta={t("generate.cta")} onCta={generate} ctaLoading={generating}`.
      5. Generate error (and not `blockedByServer`) → `ErrorState title={t("generateError.title")} body={err.message} onRetry={generate}`. It renders ABOVE the still-visible previous tour (AC-11).
      6. `limitedData` → an inline notice with `limitedData.title` / `limitedData.body` (`Icon` `Info`).
      7. `ready` → `orderedSections(tour).map(s => <SectionCard key={s.kind} kind={s.kind} title={t(\`sectionTitles.${s.kind}\`)}><SectionBody section={s} onOpenFile={openFile} /></SectionCard>)`.
    - `<SourceFileDrawer repoId path={filePath} mode={viewerMode} onMode={setViewerMode} onClose={closeFile} />`
  - `styles.ts`: `export const s = { … } satisfies`-per-key, using the `CSSProperties` pattern. Do NOT spread an annotated const (`client/INSIGHTS.md` 2026-09-22, TS2742).
- **Skills to invoke:** `next-best-practices`, `react-best-practices`, `react-frontend-best-practices`, `typescript-expert`
- **Depends on:** Steps 9, 10, 11, 13
- **Done when:** `helpers.test.ts` covers `extractCommands` (a fenced `sh` block with 3 commands → 3 items, `#` comment dropped, `$ ` stripped; no fence + inline-code list → items; prose only → `[]`) and `orderedSections`. Navigating to `/repos/<seeded id>/onboarding` on the dev stack renders the blocked notice and a disabled Generate.

### Step 13 — Route components  ·  [frontend]
- **Files:** all new under `client/src/app/repos/[repoId]/onboarding/_components/`, each a folder with `Name.tsx` + `index.ts` (+ `styles.ts` as needed):
  - `SectionCard/`
  - `SectionBody/` (+ `SectionBody.test.tsx`)
  - `NumberedList/`
  - `CommandList/`
  - `CriticalPathList/`
  - `SourceFileDrawer/` (+ `SourceFileDrawer.test.tsx`)
- **Layer:** n/a
- **Interfaces:**
  - `SectionCard({ kind, title, defaultOpen = true, children })`. A `Card` whose header is a `<button aria-expanded>` with `ChevronDown`/`ChevronRight` and the title, toggling local `open` state (collapse is pure UI, so local state is acceptable). Root has `data-kind={kind}` (AC-3).
  - `SectionBody({ section, onOpenFile })` switches on `section.kind`:
    - `architecture` → `<Markdown>{body}</Markdown>`, then `{section.diagram && <MermaidDiagram chart={section.diagram} />}` (AC-6). `MermaidDiagram` is imported from `@/components/mermaid-diagram`.
    - `critical_paths` → body Markdown, then `<CriticalPathList links={section.links} onOpen={onOpenFile} />` (AC-7).
    - `how_to_run` → `const cmds = extractCommands(body)`. If there are commands, render the prose remaining before the first fence as Markdown, then `<CommandList commands={cmds} />`. Otherwise render `<Markdown>{body}</Markdown>` and the `noCommands` hint (AC-8).
    - `reading_path` and `first_tasks` → body Markdown, then `<NumberedList items={section.links.map(l => ({ primary: l.path, secondary: l.label }))} />` for reading_path (path on top, rationale beneath; AC-9). For first_tasks use `({ primary: l.label, secondary: l.path })` (task, then file/area pointer; AC-10). Both share the circular badge.
    - Unknown kind → `null`.
  - `NumberedList({ items: { primary: string; secondary?: string }[] })`. An `<ol>` whose `<li>` each has a circular numbered badge (`1..n`), the primary text in mono font for paths, and the secondary below in muted text.
  - `CommandList({ commands: string[] })`. An `<ol>` of rows: a mono `<code>` and an `IconBtn icon="Copy" label={t("copy")}` → `void navigator.clipboard?.writeText(cmd)`. The pattern comes from `RunTraceDrawer.tsx:57`. The icon flips to `Check` for about 1.5 s using local state (AC-8).
  - `CriticalPathList({ links, onOpen })`. Rows of mono path + one-line `label` + `Button kind="ghost" size="sm" icon="Eye"` with `t("open")` → `onOpen(link.path)`. Never an `<a href>` to GitHub (AC-7).
  - `SourceFileDrawer({ repoId, path, mode, onMode, onClose })`:
    - Renders nothing when `!path`.
    - Otherwise renders `Drawer title={path} onClose={onClose}`, with data from `useOnboardingFile(repoId, path)`, a `Skeleton` while loading, and `ErrorState body={t("viewer.loadError")}` on error.
    - For `isMarkdownPath(path)`, show `Tabs` (`preview`/`raw`) with `Markdown` vs `<pre>`, exactly like `context/_components/DocViewer/DocViewer.tsx:33-47`. For every other path, show `<pre>` only.
    - No save or edit control (read-only).
  - All strings go through `useTranslations("onboarding")`.
- **Skills to invoke:** `react-best-practices`, `react-frontend-best-practices`, `react-testing-library`, `typescript-expert`, `mermaid-diagram` (diagram rendering expectations only)
- **Depends on:** Steps 9, 10, 12 (`helpers.ts`/`constants.ts`)
- **Done when:**
  - `SectionBody.test.tsx` passes. It wraps with `NextIntlClientProvider messages={{ onboarding: messages }}` as in `DocViewer.test.tsx:18-24`, and mocks `@/components/mermaid-diagram` to a stub that prints `chart`. Assertions:
    - critical_paths renders the path, its label, and an "Open" button that calls `onOpenFile` with the path (`fireEvent.click`, since there is no user-event dependency).
    - how_to_run renders N copy buttons for N commands.
    - reading_path renders badges "1", "2" with the path above the rationale.
    - first_tasks renders the task text with its pointer.
    - architecture renders the diagram stub only when `diagram` is non-null.
  - `SourceFileDrawer.test.tsx` (mocks `@/lib/hooks/onboarding`):
    - `.ts` → `<pre>` content, no tabs.
    - `.md` → preview tab default.
    - no `save` button.

### Step 14 — e2e flow 09  ·  [frontend / e2e]
- **Files:** `e2e/specs/09-onboarding-tour.flow.json` (new) · `e2e/specs/README.md` (edit: add the `08` row that is currently missing from the Coverage table, then the `09` row)
- **Layer:** n/a
- **Interfaces:** the flow, against read-only seeded data. The seeded `acme/payments-api` has no `repo_index_state` row, so `index-state` is `degraded` → blocked. No LLM call, no `chat`.
  ```json
  {
    "name": "Onboarding Tour page is reachable from the sidebar and explains why Generate is blocked",
    "description": "Seeded repo has no repo-intel index row, so GET /repos/:id/index-state is 'degraded' and SPEC-02 AC-4 blocks generation. Proves the WORKSPACE nav entry (AC-1), the empty/blocked state copy (AC-2/AC-4/AC-13), and that nothing is generated. Read-only; no model call. Assumes a freshly seeded stack — run via ../scripts/e2e.sh.",
    "steps": [
      { "cmd": ["open", "{BASE}/"], "label": "load the app root" },
      { "cmd": ["wait", "--url", "/pulls"], "label": "land on the PR list" },
      { "cmd": ["wait", "--load", "networkidle"], "label": "shell and repo context settle" },
      { "cmd": ["find", "role", "link", "click", "--name", "Onboarding Tour"], "label": "click the WORKSPACE nav entry" },
      { "cmd": ["wait", "--url", "/onboarding"], "label": "on /repos/:repoId/onboarding" },
      { "cmd": ["wait", "--load", "networkidle"], "label": "tour + index-state settle" },
      { "cmd": ["wait", "--text", "Indexing hasn't finished"], "label": "blocked explanation shown (AC-4)" },
      { "cmd": ["wait", "--text", "Generate onboarding tour"], "label": "generate CTA present (disabled)" },
      { "cmd": ["wait", "--text", "how to run locally"], "label": "corrected 5-section description (AC-13)" }
    ]
  }
  ```
  - `wait --text` is case-sensitive against rendered text. The strings above must match Step 10's copy verbatim and must not be styled with `text-transform` (`e2e/INSIGHTS.md` 2026-09-27).
  - Use `--url "/onboarding"` only *after* the click. `/pulls` → `/repos/<id>/onboarding` is unambiguous here because the add-repo page is never visited in this flow.
- **Skills to invoke:** `typescript-expert` (determinism review per `e2e/CLAUDE.md`)
- **Depends on:** Steps 10–13
- **Done when:** `./scripts/e2e.sh` runs flows 01–09 green.

### Step 15 — Contract docs  ·  [full-stack]
- **Files:** `server/specs/api-contract.md` (edit: add a `## Onboarding tour` section after `## Project context`) · `client/specs/ui-flows.md` (edit: add a `## /repos/:repoId/onboarding — Onboarding Tour` section after the Project Context one)
- **Layer:** n/a
- **Interfaces:**
  - api-contract gets a table of the 3 routes plus a paragraph covering:
    - GET is always 200 for a known repo (`status: 'not_generated'` is the empty state).
    - generate is inline, makes one LLM call, is rate-limited 6/min, returns 409 `index_not_ready` unless the index status is `full`, returns 502 `external_service_error` on model failure/timeout/schema failure, and leaves the stored tour untouched on any failure.
    - `/file` serves only paths referenced by the stored tour.
  - ui-flows gets:
    - Data sources.
    - The 5-section fixed order.
    - The blocked vs limited-data distinction.
    - `?file=`/`?mode=` drawer state in the URL.
    - The note that the add-repository route `/onboarding` is unrelated.
- **Skills to invoke:** none
- **Depends on:** Steps 7, 12
- **Done when:** both docs list the new surface, and the wording matches the implemented status codes.

## Contract changes
- **New** `server/src/vendor/shared/contracts/onboarding.ts` **and** `client/src/vendor/shared/contracts/onboarding.ts` (identical): `OnboardingSectionKind`, `OnboardingTourStatus`, `OnboardingTour`, `OnboardingIndexNotReady`.
- **Edit** `server/src/vendor/shared/index.ts` **and** `client/src/vendor/shared/index.ts`: one `export * from './contracts/onboarding.js';` line each, plus a header-comment line.
- `knowledge.ts` (`Onboarding*`) and `platform.ts` (`FEATURE_MODELS`, `SpecFile`) are **unchanged** on both sides.
- `server/src/modules/onboarding/generator.ts` holds a module-private `OnboardingDraftSchema` (the LLM output shape). It is not a shared contract.

## Database
None. The `onboarding` table and its migration already exist (`server/src/db/schema/context.ts:120-126`, `0000_init.sql`). Do **not** run `pnpm db:generate`, and if a stray migration appears, nothing in this plan caused it. Writes are a single upsert on the PK `repo_id`.

## Verification
1. `cd server && pnpm typecheck && pnpm test && pnpm arch`. `pnpm arch` must report **no new** violations. Pay particular attention to `no-cross-module-reach` for `onboarding/*` vs `context/`/`settings/`, and to `no-domain-outward` for `onboarding/helpers.ts`/`constants.ts`/`types.ts`.
2. `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` passes without Docker. That confirms the new hermetic helper test is hermetic.
3. `cd client && pnpm typecheck && pnpm test && pnpm lint`
4. `diff server/src/vendor/shared/contracts/onboarding.ts client/src/vendor/shared/contracts/onboarding.ts` prints nothing.
5. API on the dev stack (`./scripts/dev.sh`), against the seeded repo id `<id>`:
   - `curl -s localhost:3001/repos/<id>/onboarding` → `{"repo_id":"<id>","status":"not_generated","tour":null,"generated_at":null,"limited_data":false}`
   - `curl -s -X POST localhost:3001/repos/<id>/onboarding/generate` → HTTP 409 `{"error":{"code":"index_not_ready",…,"details":{"index_status":"degraded"}}}`
6. A real repo with a `full` index and an OpenRouter key (or a Settings → Feature Models override for "Onboarding Tour"):
   - Open `/repos/<id>/onboarding`, click **Generate onboarding tour**, and confirm five collapsible cards appear in the order Architecture → Critical paths → How to run locally → Reading path → First tasks.
   - Confirm the architecture diagram renders, each command has a working Copy button, and **Open** on a critical path opens the drawer with the file's source.
   - Confirm "Last refreshed …" shows.
   - Click **Regenerate**: the timestamp advances and the row count in `onboarding` stays 1.
   - Break the key, click Regenerate again, and confirm the error state with Retry appears above the old tour, which is unchanged.
7. `./scripts/e2e.sh` runs flows 01–09 green.

## Risks / open questions
- **Open question (AC-13, resolution 5):** the sidebar label is a literal in vendored `nav.ts`, identical to the i18n `onboarding.nav` string, because `NavItem` renders `item.label` raw and every NAV label is a literal today. Translating sidebar labels would mean editing `client/src/vendor/ui/shell/**` (Do not touch). Confirm this is acceptable, or authorize a separate change to the design system's nav rendering.
- **Open question (AC-10, resolution 2):** the prompt's "up to 4 links" rule limits first tasks to 3–4 entries. That satisfies "3–5" but can never produce 5. Allowing 5 would mean editing `onboarding.system.md`, which the spec says not to do.
- **Risk, Steps 5/13 (how_to_run grounding):** the only grounded source of run commands is the Project Context docs. A repo whose `specs/`/`docs/`/`insights/` say nothing about running it gets prose plus the `noCommands` hint, not commands. Adding README/`package.json` excerpts is a spec change.
- **Risk, Steps 2/7 (Windows):** `getCriticalPaths` is always `[]` on Windows (`file_edges` empty; `server/INSIGHTS.md` 2026-09-30). The `isLimitedData` rule is an AND across both conditions and also requires filesIndexed < 10 to fire alone, so a well-indexed repo on Windows does NOT show the notice. But its critical_paths section will be grounded only in top files.
- **Risk, Step 7 (latency):** the default `deepseek/deepseek-v4-flash` over OpenRouter has exceeded 120 s on single-call tasks (`server/INSIGHTS.md` 2026-09-23). The error message names the Settings → Feature Models remedy. The inline request can take up to the 120 s ceiling.
- **Risk, Step 7 (GET cost):** `limited_data` is recomputed on every GET via `getIndexState` + `getCriticalPaths` (which loads all edges and ranks) + `getTopFilesByRank`. That is fine for a local single-user app; if it becomes slow, persist the flag (that needs a schema change and is out of scope).
- **Risk, Step 7 (limited_data drift):** because the flag is derived from current facts, a re-index after generation can flip the notice without regenerating. This is accepted as "reflects current data".
- **Risk, Step 4:** `ContextService` is a shared singleton. The `scanCached` extraction must not change the `listDocuments` cache semantics. `context.it.test.ts` guards this.
- **Risk, Step 14:** the flow depends on the seed having no `repo_index_state` row for `acme/payments-api`. If a future seed indexes it, the blocked assertion has to change to the empty-state CTA.
- **Not planned (adjacent):** the stale `generate.body` in other locales (only `en` exists); a `g o` shortcut; fixing the Windows `toRel` bug in `adapters/depgraph/index.ts`; the `e2e/specs/README.md` coverage table missing `08` gets fixed as a one-line doc addition in Step 14 only because that table is edited anyway.
- **Skills map:** `Glob .claude/skills/*/SKILL.md` matches the `pr-self-review` map. The only extras are `run-plan`, `workflow-retro`, `engineering-insights` and `mermaid-diagram`; the first three are workflow skills, not file-path skills. No update to the map is needed.
- **Session protocol:** per root `CLAUDE.md`, the implementer runs `engineering-insights` at wrap-up. Likely entries: the `{{sections}}` placeholder being the per-feature formatting slot, and the `/onboarding` route-name collision.

## Do-not-touch confirmations
- `server/src/db/migrations/**` + `meta/_journal.json`: no schema change, no migration generated.
- `client/src/vendor/ui/**`: only `nav.ts` gets one data entry (the documented extension point, `client/INSIGHTS.md` 2026-09-22). `shell/**`, `icons.tsx` (`Lightbulb` already exists), `kit/**` and `primitives/**` are untouched, and every UI import goes through the `@devdigest/ui` barrel.
- `server/src/vendor/shared/**` / `client/src/vendor/shared/**`: one new identical file per side plus one barrel line per side. Existing contract files are not edited.
- `server/clones/**`: read-only access through `safeJoin`-guarded reads in `onboarding/reader.ts` and the existing `ContextService` scan. Nothing writes to the clone.
- `client/.next/**`, `**/test-results/**`: not touched.
- `skills-lock.json`: not touched.
- Lesson scaffolding: the `onboarding` table, the `Onboarding*` contracts, the `onboarding.json` namespace, the `'onboarding'` FEATURE_MODELS entry and the `"onboarding-tour"` active key are all **consumed**. None is deleted or duplicated.
- `e2e/specs/06-onboarding.flow.json`: untouched. The new flow is `09-onboarding-tour.flow.json`.
