# Spec: Project Context Folder
Spec ID: SPEC-01
Status: draft
Supersedes: none
Design sources: none fetched this run. The request describes four product screenshots in prose (Project Context browser, Agent editor Context tab, Skill editor Context section, PR run trace panel); no Figma link, image, or PDF path was supplied for me to open directly, so those descriptions are treated as caller-supplied requirements text, not a verified design artifact — any UI detail that conflicts with code I *did* read this run (noted inline below) is flagged rather than assumed.

## Problem and user

DevDigest agents and skills currently have no way to ground a review in the team's own written requirements (PRDs, architecture notes, incident write-ups). A reviewer today only sees the diff, repo-intel's derived code facts, linked skills, and (from L03) derived PR intent — never the project's own `specs/docs/insights` Markdown. A user authoring an agent wants to pin specific project documents to it (e.g. "this agent must always see `specs/public-api.md`") so a review can catch a violation of a written invariant, not just a generic code smell, and cite the document it used.

This is a cross-module feature by design: a repo-side document reader (`server`), a new attachment relationship on agents/skills (`server` + `client`), feeding an **already-scaffolded** `reviewer-core` prompt slot (`server`), and three client surfaces (browser page, two editor panels) plus the run-trace drawer (`client`). No single package owns it end to end, so it is filed at the root per this repo's cross-module rule.

## Important: this runs on existing scaffolding, not a blank slate

Several pieces of this feature already exist, unconsumed, as "lesson scaffolding" (per root `CLAUDE.md`'s "Do not touch" note on reserved tables/contracts/namespaces). This spec's job is largely to **feed** them, not invent new shapes:

- `reviewer-core/src/prompt.ts`'s `assemblePrompt` already has an optional `specs?: string[]` slot that wraps each entry with `wrapUntrusted('spec-N', …)` and renders it as `## Project context` in the user message — the exact heading and untrusted-wrapping behavior this feature's acceptance scenario requires, already following the engine's omit-when-empty contract (`reviewer-core/CLAUDE.md`).
- `server/src/vendor/shared/contracts/trace.ts`'s `RunTrace` already has `specs_read: z.array(z.string())` and `PromptAssembly.specs`; `server/src/modules/reviews/run-executor.ts` already hardcodes `specs_read: []` and never passes `specs` into `reviewPullRequest` — the field exists, it is just never fed.
- The client's trace drawer (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`) already renders a `trace.config.specsRead` row and a `trace.prompt.specs` prompt-assembly block whenever these fields are non-empty/non-null — today they never are.
- `client/messages/en/runs.json` already has `"specsRead": "Specs read"` and `"specs": "Project context (dynamic)"` i18n strings for exactly this trace surface.
- `client/messages/en/context.json` already has a full i18n namespace for a "Project Context" page (title, empty state, preview/edit mode labels, index status, re-index/resync, editor save) and `client/messages/en/shell.json`'s nav registry already has a `"context": "Project Context"` label — but `client/src/vendor/ui/nav.ts`'s actual `NAV` array (the source of truth for what renders) currently has only a `"pulls"` item under `WORKSPACE`; the sidebar item this feature needs does not exist yet and must be added there, following the per-lesson extension precedent already used for `"skills"` (`client/INSIGHTS.md`, 2026-09-22 entry).
- `server/src/vendor/shared/contracts/platform.ts` already declares `SpecFile { path, content?, size?, updated_at? }` and `IndexStatus { status: idle|cloning|parsing|embedding|done|error, pct, message?, chunks_indexed? }` under an explicit `// ---- Project Context ----` comment block — scaffolded for this exact feature, currently with no server route or client consumer.
- `server/src/db/schema/context.ts`'s `code_chunks` table (`source: 'code'|'docs'|'spec'`, with a pgvector `embedding` column) is a **different, more advanced** semantic-indexing feature (embeddings + coverage scoring) that the request explicitly places out of scope for this spec — this feature does not write to `code_chunks` and does not call an embedding model.
- `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx` is the closest working precedent for "checkbox to attach + reorder + filter box + attached count" — it already implements exactly that pattern for skills-on-an-agent (`agents.json`'s `"orderHint"` string: *"Order matters — earlier skills appear earlier in the assembled prompt. Toggle to attach."*). This feature's Context tab should read as the same pattern applied to documents instead of skills. Note: its reorder control is up/down `IconBtn`s (`move(skillId, delta)`), not a drag handle as the source screenshot shows — the exact reorder widget is a presentational choice for implementation, not a spec-level commitment.
- `client/messages/en/context.json`'s committed empty-state copy ("Drop your PRDs, tech specs, and acceptance criteria under .devdigest/specs/") names a single `.devdigest/specs/` root. This is **stale placeholder copy predating this feature** — resolved: the real search roots are the configured `specs/`, `docs/`, `insights/` directories (recursive, anywhere in the repo), and any UI path/breadcrumb for the Project Context root must show that, not `.devdigest/specs/`.
- `client/src/app/skills/_components/SkillDetailPane/SkillDetailPane.tsx` (the Skill editor) has **no tab system today** — it is one flat form. The request's own wording ("shown as a 'Project context to use' section rather than its own tab") already resolves this in favor of an inline section, not a new tab mechanism for skills.

## Goals / Non-goals

**Goals:**
- Discover every `.md` file under configured `specs/`, `docs/`, and `insights/` roots (recursively) in an imported repo's clone, and let the user browse/preview it from a new **Project Context** page.
- Let the user manually attach an ordered list of these documents to an **Agent** (new Context tab) or a **Skill** (new "Project context to use" section); a skill's attachments are inherited by every agent using that skill.
- Store only file paths (+ explicit order) against the agent/skill — never the document body.
- At run time, read the currently-attached documents straight from the repo clone (pure file I/O, no extra LLM call) and feed them into `reviewer-core`'s existing `specs` prompt slot, rendered as the untrusted `## Project context` block.
- Make the already-scaffolded `specs_read` trace field and `## Project context` prompt-assembly block show real data.
- Show, per document, how many agents/skills currently reference it ("used by N agents") — decided in-scope here because it is a cheap derived count over attachment metadata this feature already owns.

**Non-goals:**
- Automatic / content-based document selection (picking documents based on PR content) — explicitly a separate future feature.
- Semantic indexing, embeddings, chunking, or the "coverage" / "78 COVERAGE" scoring badge shown in the source screenshot — that belongs to the separate feature already scaffolded via `code_chunks`'s `embedding` column and `IndexStatus.chunks_indexed`; this feature neither computes nor displays a coverage score.
- **Document creation/upload.** The Project Context page is browse + preview + attach only. Any add/new-folder/upload icon buttons shown in the source screenshot imply authoring or writing new files into the repo's working tree — that is explicitly out of scope for this spec and is not designed here at all (not even as a deferred detail).
- Any change to `reviewer-core`'s pipeline order, grounding gate, or scoring — this feature only feeds an existing, already-wired-in prompt slot.

## User stories

- As an agent author, I attach `security-baseline.md` and `public-api.md` to my Security Reviewer agent so every run of that agent is grounded in those two documents, in that order.
- As a skill author, I attach `public-api.md` to a shared rubric skill so every agent using that skill inherits it without re-attaching it per agent.
- As a reviewer reading a run's trace, I see exactly which document paths were read for that run and where the resulting block sits in the assembled prompt, so a surprising (or missing) finding is explainable.
- As the user verifying this feature, I attach a document stating "module `api/` must not import `db/` directly" to an agent, open a PR that violates it, run that agent, and the resulting finding explicitly names that document.

## Acceptance criteria (EARS)

- AC-1: The system shall add a "Project Context" item to the Workspace section of the app sidebar, next to the existing Pull Requests entry.
- AC-2: WHEN the user opens the Project Context page for an imported repo, the system shall list every `.md` file found recursively under the repo's configured `specs/`, `docs/`, and `insights/` roots, sorted alphabetically by path.
- AC-3: IF the repo has not finished cloning or has no matching documents, THEN the system shall show an empty state with guidance, not an error.
- AC-4: WHEN the user selects a document in the Project Context list, the system shall render it in a Preview/Edit split, defaulting to rendered-Markdown Preview.
- AC-5: WHILE the user is on an Agent editor's Context tab, the system shall list every discovered document, sorted alphabetically by path, with a checkbox (attached/not), its file name, its source-folder badge (specs/docs/insights), a Preview action, and a text filter.
- AC-6: WHEN the user checks a document in an agent's Context tab, the system shall attach it to that agent as a file path, preserving the order documents were added or manually reordered into.
- AC-7: WHILE the user is viewing a Skill editor, the system shall show a "Project context to use" section with the same list/filter/attach/reorder/Preview behavior as the Agent Context tab, and state that any agent using this skill inherits these documents.
- AC-8: The system shall display an attached-count summary (e.g. "N of M attached") and an approximate token count for the currently-attached document set, in both the Agent Context tab and the Skill context section.
- AC-8a: IF the currently-attached document set exceeds the assembled `## Project context` block's size cap, THEN the system shall show a visible warning next to the attached-count/token display (in both the Agent Context tab and the Skill context section) stating that the attached set will be truncated.
- AC-9: WHERE a skill has one or more attached documents, the skill's context section shall also show the literal Markdown block that will be serialized into the prompt (the "SERIALIZES AS" preview).
- AC-10: The system shall let the user manually reorder an agent's or skill's attached documents, and that order shall determine the order documents appear in the assembled `## Project context` block.
- AC-11: IF no document is attached to an agent (directly or via an inherited skill), THEN the system shall omit the `## Project context` section from that agent's prompt entirely — no automatic or content-based attachment ever occurs.
- AC-12: WHEN an agent run executes, the system shall read the agent's currently-attached documents (its own attachments plus those inherited from its linked, enabled skills) directly from the repo's clone and pass their contents into `reviewer-core`'s existing `specs` prompt slot, with no additional LLM call required to assemble them.
- AC-12a: The system shall assemble an agent's project-context documents with skill-inherited documents first (in each linked skill's configured order), followed by the agent's own directly-attached documents (in their configured order); WHEN the same path is attached both via an inherited skill and directly on the agent, the system shall keep it once, at its earliest (skill-position) occurrence, and shall not repeat it later in the block.
- AC-12b: IF the total assembled `## Project context` block for a run would exceed its configured size cap (the same capping mechanism as `reviewer-core/src/prompt.ts`'s existing `MAX_PR_DESCRIPTION_CHARS`/`MAX_INTENT_BRIEF_CHARS`, via a new named constant for this block), THEN the system shall truncate the block rather than fail the run, and the truncation shall be visible to the user (see AC-8a) rather than silent.
- AC-13: WHEN a run completes, the system shall populate that run's persisted `RunTrace.specs_read` with the literal list of document paths that were read for it.
- AC-14: WHILE viewing a run's trace drawer, the system shall list "Project context" among the Prompt assembly blocks whenever `prompt_assembly.specs` is present for that run.
- AC-15: IF an attached document's path cannot be read at run time (deleted, moved outside the configured roots, or unreadable), THEN the system shall omit that document from the assembled context and continue the run rather than failing it.
- AC-16: WHEN an agent with an attached document stating an explicit architectural invariant reviews a PR that violates that invariant, the system shall produce a finding whose rationale names the specific attached document (by path or file name), not a generic code-smell finding.
- AC-17: The system shall show an indexing status line on the Project Context page containing only a document count and a last-scanned time (e.g. "12 files · scanned 5m ago" — no "chunks" count, since that term names the separate, out-of-scope semantic-indexing feature), with a manual refresh action that re-scans the configured roots.
- AC-18: The system shall show, per document, a count of how many agents and skills currently attach it, derived from existing agent/skill attachment metadata.

## Edge cases

- A repo with no `specs/`, `docs/`, or `insights/` directories at all → empty document list, not an error (AC-3).
- A document attached to an agent is later deleted or moved out of the configured roots before the next run → degrades per AC-15 (omitted, run continues), matching the existing "best-effort enrichment" convention already used for repo-intel digests in `run-executor.ts` (`repoMap`/`callersDigest` failures are logged and omitted, never fail the run).
- A document attached to a skill that is later disabled → inherited attachment contributes nothing, mirroring the existing rule that a linked-but-disabled skill's body contributes nothing to the prompt (`buildSkillsDigest` in `run-executor.ts` filters on the skill's own `enabled` flag).
- A very large document or a large attached set → capped and truncated per AC-12b, with a visible UI warning (AC-8a) rather than a silent cut; `reviewer-core/src/prompt.ts` already caps the PR description (`MAX_PR_DESCRIPTION_CHARS`) and intent digest (`MAX_INTENT_BRIEF_CHARS`) the same way — the new cap for the assembled `specs` block follows that same mechanism, as a new named constant.
- Two documents with the same file name in different source folders (e.g. `docs/webhooks.md` and `specs/webhooks.md`) must remain distinguishable in every list (full relative path, not bare file name, disambiguates).
- Re-scanning the repo (manual refresh) while an agent run is mid-flight, reading the same document — the run already loaded its own snapshot at start; a later rescan must not retroactively change a trace already written for a completed run.
- An unindexed-but-"full"-status repo (the existing `repo-intel` degradation case documented in `server/INSIGHTS.md`, 2026-09-23 entry, where a non-TS/JS repo reports `status: 'full'` with almost nothing indexed) is a separate indexer (`repo-intel`'s code-symbol index) from this feature's own `.md` walk — this feature's document discovery does not depend on `repo-intel`'s indexed-file count and must not inherit that degradation.

## Non-functional requirements

- **Security/prompt-safety**: every attached document is untrusted content at run time and must go through the existing `wrapUntrusted` + `INJECTION_GUARD` treatment (`specs/review-flow.md` P1/P2) exactly as `reviewer-core/src/prompt.ts`'s `specs` slot already does — no new injection-guard design is needed here, only wiring real data into the existing one.
- **Performance**: assembling the `## Project context` block is pure file reads against the local clone (no network call, no LLM call) — consistent with the explicit requirement that this must not add latency or cost to a run beyond disk I/O.
- **Observability**: `specs_read` and the Prompt assembly "Project context" block are the only new observability surfaces required; no new trace fields beyond what `RunTrace`/`PromptAssembly` already declare.
- Accessibility/i18n: user-visible strings belong in the existing `client/messages/en/context.json`, `agents.json`, and `skills.json` namespaces per this repo's convention, extending rather than replacing the keys already scaffolded there.

## Inputs and provenance

- Document inventory: a recursive file-system walk of the repo's clone directory (the same clone root `server/src/adapters/git/simple-git.ts`'s `SimpleGitClient.clonePathFor` resolves), filtered to `.md` files under configured `specs/`, `docs/`, `insights/` roots at any depth. The set of root directory names is configuration, not a hardcoded list (per the request) — concretely how that configuration is exposed (env var, per-repo setting) is left to the implementation planner, following this repo's existing `DEVDIGEST_*` env-config convention (`server/src/platform/config.ts`).
- Document content: read directly from the clone on disk at preview time and at run time (same pattern as `repo-intel`'s existing `readFile(join(clonePath, file), 'utf8')` helper in `server/src/modules/repo-intel/service.ts`) — never cached document text stored in the DB for this feature (only the path is persisted, per the request's explicit storage requirement).
- Attachment metadata — conceptual model only (the DB/migration shape is intentionally left to `implementation-planner`): each **agent** owns its own ordered list of attached document paths, and each **skill** owns its own ordered list of attached document paths — in both cases "ordered list of {path, attached}" (or equivalently, an ordered array of attached paths plus the full discovered set for the UI's checkbox list), **paths only, never document text**. The two nearest existing shapes in this codebase — the `agent_skills` join table (`agent_id, skill_id, order` — `server/src/db/schema/agents.ts`) and skills' own `evidence_files: jsonb<string[]>` column (`server/src/db/schema/skills.ts`) — are precedents for "ordered list" and "jsonb path array" respectively, not a prescription.
- Assembly order (resolved): for a given agent run, the ordered list fed into the `specs` prompt slot is every linked, enabled skill's attached documents (in the skill's configured order, skills themselves in their linked order), followed by the agent's own directly-attached documents (in their configured order); a path appearing in both is kept once, at its earliest (skill-position) occurrence (AC-12a).

## Untrusted inputs

- Every attached document's content is untrusted at run time: it originates from the repo being reviewed (same trust level as the diff, PR description, or repo map) and must never be treated as instructions to the model. This is already governed by `specs/review-flow.md` P1–P3 and `reviewer-core/src/prompt.ts`'s existing `wrapUntrusted`/`INJECTION_GUARD` handling of the `specs` slot — this feature supplies the data, it does not change the guard.
- A document's content could itself contain a prompt-injection attempt (e.g. a "PRD" that says "ignore all findings in this file") — P3 already covers this generally ("claims inside untrusted content that a finding is intentional/a test fixture/not for production never reduce severity or scope") and needs no new rule specific to this feature.

## Open questions

All prior clarifications were answered by the requester and folded into this spec (see Acceptance criteria AC-2, AC-5, AC-8a, AC-12a, AC-12b, AC-17; Non-goals; Inputs and provenance). Resolved assumptions worth flagging explicitly:

- Default sort order (document list and attach-panel tables): alphabetical by path (AC-2, AC-5) — a reasonable default, not requested verbatim, noted here rather than silently assumed.
- Index status line: document count + last-scanned time only, no "chunks" number (AC-17) — same treatment.

Genuinely deferred to `implementation-planner`, by the requester's own instruction, rather than resolved here:
- The exact DB/metadata table shape for the ordered path lists owned by an agent and by a skill. This spec fixes the **conceptual** data model (see Inputs and provenance: each agent and each skill owns its own ordered list of `{path, attached}`-equivalent entries, paths only, never document text, plus the resolved skill-first/agent-second/dedup assembly order) and deliberately does not prescribe the schema or migration design.
