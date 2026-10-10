# Spec: Onboarding Generator
Spec ID: SPEC-02
Status: draft
Supersedes: none
Design sources: described-from-screenshots mockup (two screenshots, prose description only, in the caller's request — no Figma link, image path, or PDF was supplied for me to open directly, so the layout details below are treated as caller-supplied requirements text, not a verified design artifact); `server/src/prompts/onboarding.system.md` (read); `server/src/vendor/shared/contracts/knowledge.ts` (read); `server/src/db/schema/context.ts` (read); `server/src/modules/repo-intel/types.ts` (read); `client/src/vendor/ui/nav.ts` (read); `client/messages/en/onboarding.json` (read, confirmed stale); `server/specs/api-contract.md` and `client/specs/ui-flows.md` (read, for REST/route conventions).

## Problem statement and user

A developer who just imported an unfamiliar repo into DevDigest has no fast on-ramp: they can browse PRs, run reviews, and read Project Context documents, but nothing turns the repo-intel index into a first-day guide. The Onboarding Generator closes that gap with a per-repo, five-section guided tour (architecture, critical paths, how to run locally, a guided reading path, and starter tasks) that a developer new to the codebase reads once, grounded in facts the repo-intel indexer already derived, regenerable on demand as the repo evolves.

This is the last unbuilt deliverable of lesson L05 (Project Context Folder already shipped as SPEC-01; PR Brief card is a separate, out-of-scope feature). It is filed at the root because it spans `server` (new `onboarding` module, repo-intel reads, LLM call), `client` (new route, nav entry, i18n correction), and `e2e` (a new flow) by design, not by ambiguity.

## Goals / Non-goals

**Goals:**
- Manually triggered generation of a 5-section onboarding tour per repo, persisted as one row (no history), overwritten on regenerate.
- Ground every section in real repo-intel facts (`getRepoMap`, `getCriticalPaths`, `getTopFilesByRank`) AND the repo's scanned Project Context documents (`specs/`, `docs/`, `insights/` markdown via `GET /repos/:id/context`), via the existing, already-correct `onboarding.system.md` prompt — this spec does not redesign that prompt.
- Gate both generation and regeneration on the repo's index being fully indexed (`getIndexState(repoId).status === 'full'`), with a clear blocked-state explanation when it is not.
- Resolve the feature's model through the existing `FEATURE_MODELS`/`resolveFeatureModel` registry (`"onboarding"` entry already present on both sides) — no new settings UI.
- Add a client route, sidebar nav entry, and corrected i18n copy for the real 5 sections (replacing the stale "overview, architecture, key modules, getting started, conventions & gotchas" copy in `client/messages/en/onboarding.json`).
- Add a new deterministic e2e flow for the onboarding-tour journey, numbered after the existing `01`–`08` flows (i.e. `09-...`), without touching `06-onboarding.flow.json` (a same-named but unrelated, already-shipped "add a repository" screen).

**Non-goals:**
- Any history/versioning of past tours — the `onboarding` table is one row per repo by design; this spec does not add one.
- Any indexing or (re)cloning triggered by this feature — indexing is owned by the existing clone/fetch pipeline; Generate/Regenerate only read the current repo-intel state (consistent with invariant C1 in `specs/review-flow.md`: "repo-intel is read-only at review time").
- A "Share link" action — present in the design reference mockup's screenshot, deliberately excluded here so its absence in the shipped UI is a known omission, not an oversight.
- Any GitHub-issue-tracker integration for the "First tasks" section — `repo-intel` has no such facade method, and none is added by this spec; tasks are grounded only in real files/areas already available from repo-intel.
- A new settings surface for the onboarding feature's model — the existing Settings → Feature Models UI already covers it.

## User stories

- As a developer who just imported `payments-api`, I open its Onboarding Tour page, see the empty state, click "Generate onboarding tour", and after it completes I read all 5 sections to understand the codebase before my first PR.
- As a developer returning to a repo weeks later, I click "Regenerate" so the tour reflects the repo's current state, without re-triggering a clone or re-index.
- As a developer on a repo whose index just started, I open the Onboarding Tour page and see why Generate is disabled, instead of a crash or a tour grounded in stale/partial data.

## Acceptance criteria (EARS)

- AC-1: The system shall add an "Onboarding Tour" item to the sidebar's WORKSPACE section, positioned between "Pull Requests" and "Project Context", linking to `/repos/:repoId/onboarding`.
- AC-2: WHEN the user opens the Onboarding Tour page for a repo with no stored `onboarding` row, the system shall show the empty-generation state (existing `generate.title`/`generate.body`/`generate.cta` copy) with a "Generate onboarding tour" call to action.
- AC-3: WHEN the user opens the Onboarding Tour page for a repo with a stored `onboarding` row, the system shall render its 5 sections in the fixed order `architecture`, `critical_paths`, `how_to_run`, `reading_path`, `first_tasks`, each as a collapsible card, alongside a "Regenerate" action and a last-refreshed indicator derived from `generatedAt`.
- AC-4: IF `getIndexState(repoId).status` is not `'full'` WHEN the user requests Generate or Regenerate, THEN the system shall hard-block the action entirely and show an explanatory message that indexing has not finished, rather than attempting the LLM call. (This is the only case that blocks the action outright — contrast AC-14, a softer warning on an otherwise-permitted generation.)
- AC-5: WHEN the user triggers Generate or Regenerate on a repo whose index status is `'full'`, the system shall assemble prompt facts from BOTH the repo-intel facade (`getRepoMap`, `getCriticalPaths`, `getTopFilesByRank`) AND the repo's already-scanned Project Context documents (via the existing `GET /repos/:id/context` service/cache — `specs/`, `docs/`, `insights/` markdown), call the LLM once using the `"onboarding"` feature-model resolution, persist the resulting `Onboarding` payload over any existing stored row for that repo, and return the fresh payload.
- AC-6: The system shall render the `architecture` section's `body` as Markdown and its `diagram` (when present) as a rendered Mermaid diagram, consistent with `onboarding.system.md`'s rule that `diagram` is populated only for `architecture` and `routes_and_apis` section kinds.
- AC-7: The system shall render the `critical_paths` section as a list of rows, each showing a file path, its one-line reason, and an "Open" action that opens that file in an in-app, read-only file viewer reusing the existing Project Context preview pattern (`/repos/:repoId/context`'s rendered/raw preview pane) — never an external GitHub link.
- AC-8: The system shall render the `how_to_run` section as an ordered, copyable list of shell commands, each individually copyable.
- AC-9: The system shall render the `reading_path` section as an ordered, numbered list of file paths (circular numbered badges), each with a one-line rationale beneath it.
- AC-10: The system shall render the `first_tasks` section as an ordered, numbered list (the same circular-numbered-badge visual pattern as `reading_path`), each item a short task description paired with a file or area pointer, with 3-5 entries total.
- AC-11: IF an attempted Generate/Regenerate LLM call fails or times out, THEN the system shall leave any previously stored tour untouched and show an error state with a retry action, rather than overwriting the stored row with a partial result.
- AC-12: WHEN a tour is successfully generated or regenerated, the system shall update `generatedAt` to the completion time and reflect it in the page's last-refreshed indicator.
- AC-13: The system shall label the sidebar nav item, page title, section titles, and corrected empty-state description using i18n strings in `client/messages/en/onboarding.json`, replacing the existing stale 5-section description with one naming `architecture`, `critical_paths`, `how_to_run`, `reading_path`, and `first_tasks`.
- AC-14: IF the repo's index status is `'full'` but repo-intel's facts are empty or near-empty (e.g. `getCriticalPaths` and `getTopFilesByRank` both return very little), THEN the system shall still generate the tour but surface a visible "limited data" notice on the page, rather than silently presenting a confident-looking but thin tour as if it were complete.

## Edge cases

- A repo with `index-state.status: 'partial'` or `'degraded'`: Generate/Regenerate stay blocked (AC-4); the page must not silently proceed with thin facts the way `getConventionSamples`/`getTopFilesByRank` are documented to do elsewhere (`server/INSIGHTS.md`, 2026-09-23 entry) — the gate gives the user an explicit reason instead.
- A repo whose index is `'full'` but has near-zero indexed files (the documented `repo-intel` degradation case for non-TS/JS repos, `server/INSIGHTS.md` 2026-09-23/2026-09-30 entries) passes the hard gate (AC-4) but triggers the softer "limited data" notice (AC-14) instead of silently producing a confident-looking but thin tour.
- Regenerate called while a previous generation for the same repo is still in flight: no concurrency guard is required — this is a single local-user, no-auth application with no realistic multi-writer scenario, so "last write wins" (whichever call completes last overwrites the stored row) is acceptable and intentional, not a gap.
- An LLM response that violates the prompt's strict grounding rules (an invented file path or route) is a system-prompt-level concern already addressed by `onboarding.system.md`'s existing rules; this spec does not add a second server-side grounding check beyond what the Zod `Onboarding` schema already validates structurally.
- Repo has zero critical paths or zero rankable files (e.g. a brand-new or near-empty repo): the `critical_paths`/`reading_path` sections may render with few or no entries; the LLM is still called (the index-completeness gate does not require non-empty repo-intel results), and an effectively-empty section is accepted as a true reflection of a small repo, not an error state.
- `onboarding` table write collides with a repo being deleted mid-generation: the table's `repoId` FK is `ON DELETE CASCADE`, so a deleted repo's row (if any) disappears with it; a generation in flight against a deleted repo is expected to fail at its next read and surface as a generic error (AC-11), not a special case.

## Non-functional requirements

- **Security/prompt-safety**: repo-intel facts and any Project Context documents fed into the prompt are untrusted content at generation time, same as every other reviewer-core prompt slot (`specs/review-flow.md` P1-P3); `onboarding.system.md` already specifies its own untrusted-wrapping and injection-guard handling, which this spec reuses unchanged.
- **Performance**: Generate/Regenerate make exactly one LLM call per invocation (per `onboarding.system.md`'s single structured-JSON-output design); repo-intel reads are the existing pure, non-indexing facade reads (invariant C1).
- **Observability**: no new trace/run-cost surface is specified here beyond what the feature-model registry and its surrounding settings UI already provide. Generate/Regenerate is intentionally fire-and-forget with no persisted cost/token record — the `onboarding` table (unlike `agent_runs`) has no cost/token columns, and this spec does not add any; a future lesson may add run-style cost tracking, but it is explicitly out of scope here.
- Accessibility/i18n: all user-visible strings belong in `client/messages/en/onboarding.json`, extending/correcting the existing namespace rather than introducing a new one.

## Inputs and provenance

- Repo-intel facts: `getRepoMap(repoId)` (architecture section), `getCriticalPaths(repoId)` (critical paths section), `getTopFilesByRank(repoId, n, opts?)` (reading-path section, explicitly built for this use per `server/src/modules/repo-intel/types.ts`) — all pure reads, no indexing triggered.
- Index completeness: `getIndexState(repoId)`, surfaced to the client via the existing `GET /repos/:id/index-state` route (`server/src/modules/repo-intel/routes.ts`).
- Model resolution: `resolveFeatureModel(container, workspaceId, 'onboarding')` against the server `FEATURE_MODELS` registry (mirrored client-side in `client/src/lib/feature-models.ts`, entry `id: "onboarding"`, default `openrouter` / `deepseek/deepseek-v4-flash`); a user's Settings → Feature Models override applies automatically.
- Project Context documents (the L05 feature reading `specs/`, `docs/`, `insights/` Markdown via the existing `GET /repos/:id/context` service/cache) are, resolved, a REQUIRED second grounding source alongside repo-intel facts — not optional, not deferred. Generate/Regenerate reads the repo's currently-scanned Project Context documents the same way `ContextService` already serves them to that route, and feeds them into the prompt alongside the repo-intel facts, consistent with `onboarding.system.md`'s own wording ("the provided FACTS, file tree, key-file excerpts, and context"). Any cap/truncation needed when the combined fact set is large should mirror the existing `MAX_PROJECT_CONTEXT_CHARS` capping pattern already used for the Project Context prompt slot (`specs/review-flow.md` C4) rather than inventing a new capping mechanism.
- Persistence: the existing `onboarding` table (`server/src/db/schema/context.ts`) — `repoId` (PK, cascade), `json` (the whole `Onboarding` object), `generatedAt` — one row per repo, overwritten on regenerate.
- Output contract: the existing `Onboarding`/`OnboardingSection`/`OnboardingLink` Zod contracts (`server/src/vendor/shared/contracts/knowledge.ts`, mirrored identically in `client/src/vendor/shared/contracts/knowledge.ts`) — unchanged by this spec.
- New API surface (route paths/methods to be finalized by `implementation-planner` against this repo's REST conventions, e.g. the `context`/`conventions` modules' `routes.ts` pattern): a read of the stored tour for a repo (200 with the `Onboarding` payload when a row exists, and an explicit empty/not-yet-generated response — not a bare 404 crash — when none exists yet, mirroring `conventions`'s and `context`'s empty-is-200 convention), and a generate/regenerate action that enforces the AC-4 index gate (returning a client-distinguishable blocked response, e.g. a `409`-class or a structured `index_not_ready` error per this repo's `{ error: { code, message, details } }` envelope — exact code left to the planner), persists on success, and returns the fresh `Onboarding` payload.

## Untrusted inputs

- Every repo-intel-derived fact (file paths, repo map, critical-path chains) and every Project Context document fed in per AC-5 originates from the repo being reviewed and must be treated as untrusted content at prompt-assembly time — governed by the existing `wrapUntrusted`/`INJECTION_GUARD` machinery and `onboarding.system.md`'s own explicit untrusted-block handling; this feature supplies data into that existing mechanism, it does not change it.
- The LLM's own structured JSON response is untrusted output until validated against the `Onboarding` Zod schema; a response that fails schema validation must not be persisted (falls under AC-11's "LLM call fails" handling).

## Open questions

All prior clarifications were answered by the requester and folded into this spec:
- Critical-paths "Open" action → in-app read-only file viewer, reusing the Project Context preview pattern (AC-7).
- "First tasks" layout → numbered list, same circular-badge pattern as `reading_path` (AC-10).
- Grounding sources → both repo-intel facts and scanned Project Context documents, required together (AC-5, Inputs and provenance).
- Thin-but-"full"-index tours → a distinct "limited data" notice (AC-14), separate from the hard index-completeness gate (AC-4).
- Concurrent generate/regenerate → no guard; last-write-wins is accepted for this single-local-user, no-auth app (Edge cases).
- Cost/token observability → intentionally none; fire-and-forget, consistent with the `onboarding` table's schema (Non-functional requirements).

None remaining — ready for `implementation-planner`.
