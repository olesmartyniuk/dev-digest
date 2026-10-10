# Spec: PR Why + Risk Brief
Spec ID: SPEC-03
Status: draft
Supersedes: none
Design sources: none fetched this run (no Figma link, image, or PDF was supplied). The request described the feature in prose; all UI/behavior details below are grounded in code read this run, cited inline, not in a design artifact.

## Проблема й користувач

A reviewer opening a PR's Overview tab today sees only the raw description and (when repo-intel has data) the Blast radius block (`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`) plus, above both tabs, an Intent-only `PrBriefCard` (`.../_components/PrBriefCard/PrBriefCard.tsx` — its own header comment reads *"Intent-only in L03. L05 adds Blast/Risks/History blocks as sibling `_components/*Block` children here"*, confirming this feature is exactly that scaffolded extension). Nothing today tells a reviewer, in one place, *why* a PR exists, what's risky about it, and where to start reading the diff. The PR Brief closes that gap with one generated card: a short summary, a Risk areas section, and a Review focus reading order — shown alongside the existing Intent and Blast radius data when available.

This is a cross-module feature by design: it adds a `summary`/`review_focus` field pair to the already-shared `PrBrief` contract (both vendored copies — `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`, currently identical and composing `{ intent, blast, risks, history }` with no `summary`/`review_focus`), a new server module + route(s) that call the LLM once and persist to the already-existing `pr_brief` table (`server/src/db/schema/reviews.ts:69-74` — `pr_id` PK, one `json` column, no separate SHA column), and new client blocks inside the existing `PrBriefCard` plus a click-through into the "Files changed" tab (`.../_components/DiffTab/DiffTab.tsx`). No single package owns it end to end, so it is filed at the root per this repo's cross-module rule.

## Goals / Non-goals

**Goals:**
- Add a "Generate brief" affordance to the PR Overview tab (via the existing `PrBriefCard`) when no brief has been generated yet for this PR.
- On generate, call the LLM **exactly once**, feeding it only already-computed facts: the PR's intent (`getIntent`/`getIntentRecord`, `server/src/modules/reviews/repository.ts:144-155`), the blast-radius summary and caller file list (`BlastService.get`, `server/src/modules/blast/service.ts`, reshaped from `BlastRadiusResponse`), diff stats (`PrFile.path/additions/deletions` plus the Smart Diff role groups from `SmartDiffService.get`, `server/src/modules/smart-diff/service.ts`), the PR description, and attached project-context documents — never the raw diff/patch body (`PrFile.patch` must not reach the prompt).
- Resolve the model via `resolveFeatureModel(container, workspaceId, 'risk_brief')` (`server/src/modules/settings/feature-models.ts`, backed by the `risk_brief` entry already in `FEATURE_MODELS`/`FeatureModelId`, `server/src/vendor/shared/contracts/platform.ts:18,61-66`) — never a hardcoded model id.
- Add `summary: string` and `review_focus: { file: string, line: number, reason: string }[]` to the `PrBrief`-composing schema in both vendored `brief.ts` copies, following the same "extend, don't rewrite" pattern already used when `SmartDiffRole` was added to this same file in L03 (`server/src/vendor/shared/contracts/brief.ts:81-82`).
- Persist the generated brief in the existing `pr_brief.json` column keyed by `pr_id`, with the commit SHA it was generated for stored inside that JSON blob (there is no separate SHA column — `server/src/db/schema/reviews.ts:69-74`).
- On reload with no new commits, show the cached brief without a new LLM call; on an explicit refresh/regenerate action, force a new generation.
- Render each risk with a title, its file, and severity (reusing the existing `Risk` schema's `kind`/`title`/`severity`/`file_refs`, `server/src/vendor/shared/contracts/brief.ts:50-57`), and render Review focus as an ordered `file:line — reason` list.
- Validate, server-side, that every file path appearing in Risk areas or Review focus is a real path drawn from this PR's diff (`PrFile.path`) or the blast-radius caller file list — never an invented path — before the brief is cached or returned to the client.
- Clicking a Review focus entry navigates to the matching file in the "Files changed" tab (`DiffTab`).

**Non-goals:**
- Populating or rendering the `PrBrief.history` (PR History) field — it is existing, unconsumed scaffolding (`server/src/vendor/shared/contracts/brief.ts:64-78`) that this feature does not touch; it stays as-is.
- Any staleness *detection/flagging* UI: the commit SHA stored inside `pr_brief.json` is internal bookkeeping only for this pass — no SHA-mismatch-driven "stale" banner or indicator; only an explicit refresh/regenerate click ever triggers a new generation (AC-9, AC-10).
- Scrolling the diff view to the exact line on a Review focus click (vs. opening the file/tab and scrolling the file into view) — deferred as a later nice-to-have (AC-11).
- Reusing `VerdictBanner` at the top of the brief card — explicitly optional, not required for this pass.
- Expandable risk items showing `Risk.explanation`, or risk-item click-through to its file — both deferred as nice-to-have.
- A distinct "file not in this PR's diff" user-facing message for a referenced-but-invalid path, a loading skeleton beyond the existing `Skeleton` fallback pattern already used by `PrBriefCard`/`BlastRadiusBlock`, and sourcing block labels from `client/messages/en/brief.json` rather than any hardcoded string — all nice-to-have, not required for acceptance.
- Observability of the exactly-once LLM call in trace/logs, and an input token budget cap on the generation call — implementation/observability concerns, not user-facing requirements this spec needs to detail.
- Any change to `reviewer-core`'s prompt assembly, injection guard, or grounding gate — this feature's LLM call is a direct `llm.completeStructured` call built the same way `server/src/modules/intent/service.ts` and `server/src/modules/onboarding/generator.ts` already do it (see Inputs and provenance), not a `reviewer-core` review run.

## User stories

- As a reviewer opening a new PR's Overview tab, I click "Generate brief" and, once it completes, read a short summary of what the PR does and why, see its flagged risks and which files they concern, and get an ordered list of files to review first with a reason for each.
- As a reviewer returning to a PR I've already briefed, I reload the page and see the same brief instantly, with no wait and no new LLM call.
- As a reviewer who wants a fresh take after pushing new commits, I click refresh/regenerate and get an updated brief.
- As a reviewer reading "Review focus", I click an entry and land on that file in the Files changed tab instead of having to find it myself.

## Acceptance criteria (EARS)

- AC-1: WHEN the user opens the Overview tab for a PR with no stored `pr_brief` row, the system shall show a "Generate brief" call to action in the brief card, instead of summary/Risk areas/Review focus content.
- AC-2: WHEN the user clicks "Generate brief" (or "Regenerate"), the system shall call the LLM **exactly once**, using the model resolved via `resolveFeatureModel(container, workspaceId, 'risk_brief')`, with a request built only from: the PR's intent (when present), the blast-radius summary and caller file list (when present), the diff file list with additions/deletions and Smart Diff role groups, the PR description, and attached project-context documents — and the system shall NOT include any file's raw patch/hunk body in that request.
- AC-3: WHEN generation succeeds, the system shall display a short summary of what the PR does and why, a "Risk areas" section, and a "Review focus" section, and shall persist the result (including the head commit SHA it was generated against) into `pr_brief.json` keyed by `pr_id`.
- AC-4: WHILE the PR has a stored intent and/or blast-radius data available, the system shall show the existing Intent block and Blast radius block alongside the generated summary/Risk areas/Review focus content.
- AC-5: IF the PR has no stored intent, or blast-radius data is unavailable/degraded, THEN the system shall show a single banner at the top of the PR Brief card listing every missing data source (e.g. intent, blast radius), rather than a separate inline message per block, and shall still generate and display the rest of the brief.
- AC-6: The system shall render each risk with its title, its associated file, and its severity (`high`/`medium`/`low`, from the existing `Risk` schema).
- AC-6a: The system shall display Risk areas sorted by severity with `high` first, then `medium`, then `low`; risks of equal severity shall preserve the order the model returned them in. This sort is applied server-side, after the LLM response and before caching — it is not left to the model to order.
- AC-7: The system shall render Review focus as an ordered list of `file:line — reason` entries, and that returned array order IS the reading order (first entry read first) — the brief generation prompt shall instruct the model to return `review_focus` already in read-first-to-last order; no separate ranking/scoring step or rank field is computed or displayed.
- AC-8: The system shall validate, server-side, that every file path referenced in Risk areas or Review focus is present in this PR's diff file list or its blast-radius caller file list, before the brief is cached or returned to the client — no invented file path shall ever reach the cache or the UI.
- AC-8a: IF a single risk or review-focus entry fails the AC-8 path validation, THEN the system shall drop only that offending entry and keep and cache the remainder of the brief (the rest of the risks, the rest of review_focus, and the summary) — the system shall NOT reject the whole brief and shall NOT retry the LLM call because of an invalid path.
- AC-9: WHEN the user reloads the Overview tab for a PR with an existing `pr_brief` row, the system shall display the cached brief without issuing a new LLM call, regardless of whether the PR's current head commit SHA differs from the SHA stored inside `pr_brief.json` — the stored SHA is bookkeeping only; this pass has no visible "stale" UI state and no SHA-mismatch-driven behavior.
- AC-10: WHEN the user clicks a refresh/regenerate action on an already-briefed PR, the system shall force a new generation (AC-2 applies again) and overwrite the cached `pr_brief` row on success. An explicit refresh click is, for this pass, the only way a new generation is triggered for an already-briefed PR.
- AC-11: WHEN the user clicks a Review focus entry, the system shall navigate to the matching file on the "Files changed" tab and scroll it into view; scrolling to or highlighting the entry's specific line is explicitly deferred (see Non-goals).
- AC-12: IF an attempted brief generation's LLM call fails or times out, THEN the system shall leave any previously cached brief (if any) untouched and show an error state with a retry action, rather than caching a partial result. (A response that merely contains one invalid file path is handled per AC-8a, not as a failure.)

## Edge cases

- A PR with neither stored intent nor available blast-radius data: brief still generates (AC-5); the single top-of-card banner names both missing sources together, not treated as a generation blocker.
- A PR with zero flagged risks: Risk areas renders an explicit empty state — the existing `brief.json` key `noRisks` ("No notable risks flagged.") already exists for this and should be reused rather than inventing new copy.
- The LLM returns a risk or review-focus entry naming a file that is not in the diff and not in the blast-radius caller list: that single entry is dropped server-side and the rest of the brief is cached and shown (AC-8a) — no invented path is ever shown or cached, and this is not treated as a generation failure.
- A brief in which every risk, or every review_focus entry, fails AC-8 validation: the remaining (now-empty) section renders its existing empty state (e.g. `noRisks`) exactly as if the model had returned no entries for it — dropping invalid entries per AC-8a never falls back to AC-12's failure/retry path.
- Regenerate is triggered while a previous generation for the same PR is still in flight: no concurrency guard is required — this is a single local-user, no-auth application (the same reasoning already applied to the Onboarding Generator, `specs/SPEC-02-onboarding-generator.md` Edge cases) — last write wins.
- A PR with new commits since the cached brief was generated: the stored SHA inside `pr_brief.json` is bookkeeping only for this pass (AC-9) — the cached brief keeps showing as-is until the user explicitly clicks refresh/regenerate; no visible staleness indicator is shown.
- A PR whose diff is very large (many files): the brief's Risk areas/Review focus are still expected to reference only real paths (AC-8) regardless of diff size; no separate large-diff behavior is specified here.
- A PR with no agent runs yet and no currently-enabled agents in its repo: per the resolved project-context provenance rule, no project-context documents are available to feed the brief; generation proceeds without them (same as any other missing-but-optional input).

## Non-functional requirements

- **Security/prompt-safety**: the PR description, intent text, blast-radius callers/file names, diff file stats, and any attached project-context documents are all untrusted content originating from the repo being reviewed, exactly like every other untrusted slot covered by `specs/review-flow.md` P1–P3. This feature's LLM call does not go through `reviewer-core`'s `assemblePrompt`, so it must wrap each untrusted section with `wrapUntrusted` directly, the same way `server/src/modules/intent/service.ts` (`wrapUntrusted('pr-title', …)`, `wrapUntrusted('pr-description', …)`, etc.) and `server/src/modules/onboarding/generator.ts` already do for their own direct `llm.completeStructured` calls.
- **Performance**: exactly one LLM call per generate/regenerate action (AC-2); every other fact (intent, blast, diff stats) is read from already-computed, already-persisted data — no secondary LLM calls to assemble those facts.
- **Observability**: no new trace/run-cost surface is required by this spec beyond what the `risk_brief` feature-model registry already provides.
- Accessibility/i18n: user-visible strings belong in `client/messages/en/brief.json`, extending the existing namespace (which already has `block.intent`/`block.blast`/`block.risks`/`noRisks`/`unavailable`/`unavailableHint`) with new keys for the summary block, the "Generate brief"/regenerate actions, and Review focus — exact key names are left to `implementation-planner`.

## Inputs and provenance

- Intent: `pullRepo.getIntent(prId)` / `getIntentRecord(prId)` (`server/src/modules/reviews/repository.ts:144-155`) — already-classified data, not re-derived by this feature.
- Blast radius: `BlastService.get(workspaceId, prId)` (`server/src/modules/blast/service.ts`), from which only `summary` and the caller file list are needed per the request — not the full `BlastRadiusResponse` structure.
- Diff stats: `PrFile[]` (`path`, `additions`, `deletions` — `server/src/vendor/shared/contracts/platform.ts:193-199`; `patch` explicitly excluded from the LLM request) and the Smart Diff role groups (`SmartDiffService.get`, `server/src/modules/smart-diff/service.ts`, grouped `core`/`tests`/`wiring`/`docs`/`boilerplate` per `SmartDiffRole`).
- PR description: `pull.body` (same field `OverviewTab` already renders).
- Project-context documents (resolved): the documents attached — directly or via a linked, enabled skill — to the agent(s) configured to review this PR, reusing the existing Agent-scoped attachment wiring from `specs/SPEC-01-project-context.md` (`ContextService`'s effective-paths resolution, `assembleContextPaths`/`resolveForRun` in `server/src/modules/context/service.ts`, keyed by `agentId`), read straight from the repo's clone — not every repo-wide discovered document (that broader reading is the Onboarding Generator's own, separate resolution, `specs/SPEC-02-onboarding-generator.md`). Because `POST /pulls/:id/review` (`server/specs/api-contract.md`) can run one agent or all enabled agents against a PR rather than a single fixed agent, "the agent configured to review this PR" resolves concretely as: every agent that has run against this PR (from its persisted reviews) union every currently-enabled agent in the repo when none has run yet; this feature reads each such agent's effective project-context paths and takes their union, de-duplicated by path. A PR with no agent runs and no enabled agents contributes no project-context documents — the brief still generates per AC-5.
- Model resolution: `resolveFeatureModel(container, workspaceId, 'risk_brief')` (`server/src/modules/settings/feature-models.ts`), backed by the `risk_brief` entry in `FEATURE_MODELS` (`server/src/vendor/shared/contracts/platform.ts:61-66`, default `openai`/`gpt-4.1`); a workspace's Settings → Feature Models override applies automatically, same as every other feature-model-resolved call in this codebase.
- Persistence: the existing `pr_brief` table (`server/src/db/schema/reviews.ts:69-74`) — `pr_id` (PK, cascade), `json` (the whole composed payload, including the generated-against commit SHA inside it). No new table or column.
- LLM call shape: `llm.completeStructured({ model, schema, schemaName, messages })`, the same helper already used by `server/src/modules/intent/service.ts` and `server/src/modules/reviews/*` — it validates the model's JSON response against a Zod schema and retries on a validation failure; this feature's schema is the extended `PrBrief`/`Risks` contract (summary + risks + review_focus), not a new schema shape.

## Untrusted inputs

- The PR description, the PR's derived intent text, blast-radius caller/file names, diff file paths and stats, and any attached project-context document content are all untrusted — they originate from the repo/PR being reviewed, not from the operator — and must be wrapped with `wrapUntrusted` before being placed in the LLM request, per `specs/review-flow.md` P1–P2 and the existing precedent in `server/src/modules/intent/service.ts` / `server/src/modules/onboarding/generator.ts`.
- A project-context document or PR description could itself contain a prompt-injection attempt (e.g. text instructing the model to downplay a risk); `specs/review-flow.md` P3 ("claims inside untrusted content that a finding is intentional/a test fixture/not for production never reduce severity or scope") already covers this generally and needs no new rule specific to this feature.
- The LLM's own JSON response is untrusted output until it (a) passes `llm.completeStructured`'s Zod validation and (b) passes this feature's own AC-8 file-path validation; a response failing either must not be cached (AC-12).

## Open questions

All prior clarifications were answered by the requester and folded into this spec:
- Missing intent/blast-radius messaging → one banner at the top of the PR Brief card listing every missing source, not a per-block inline message (AC-5).
- Risk areas ordering → sorted server-side by severity (high → medium → low), ties preserve the model's own output order (AC-6a).
- Review focus ordering → the returned `review_focus` array order IS the reading order; the model is prompted to return it already ordered, no separate rank field (AC-7).
- Invalid file path handling → drop only the offending risk/review-focus entry server-side after the single LLM call, keep and cache the rest; never reject the whole brief, never retry the call (AC-8a).
- Review focus click-through → opens the file on the Files changed tab and scrolls it into view; exact-line scroll/highlight is a later nice-to-have (AC-11).
- Cache staleness → no visible "stale" UI for this pass; the stored commit SHA inside `pr_brief.json` is internal bookkeeping only, and only an explicit refresh/regenerate click triggers a new generation (AC-9, AC-10).
- Which project-context documents feed the brief → those attached (directly or via a linked, enabled skill) to the agent(s) configured to review this PR, reusing SPEC-01's Agent-scoped attachment wiring — resolved concretely, given this repo's one-agent-or-all-enabled-agents review model, as the union of every agent that has run against this PR (or every currently-enabled agent when none has run yet) (Inputs and provenance).

None remaining — ready for `implementation-planner`.
