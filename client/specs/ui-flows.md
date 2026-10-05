# Spec — route and flow contract

What each screen must do, the API it leans on, and the states it has to handle. Copy and layout are not specified here.

## Global

- The app works against one local workspace; there is no sign-in.
- Every route renders inside the app shell (navigation, active-repo switcher, breadcrumbs, command palette, `g`-then-key shortcuts).
- Three data states are always handled: loading (skeleton), empty (guidance plus the action that fixes it), error (see the taxonomy in [../docs/architecture.md](../docs/architecture.md)).
- If the API is unreachable, the failure says so explicitly and names the configured API base URL.

## `/` — entry

Redirects to the first repo's PR list. With no repos, the user is sent to onboarding.

## `/onboarding` — add repository

- Accepts a repository URL and calls `POST /repos`.
- Cloning and indexing are asynchronous: the UI must return control immediately and never block on the clone.
- A repo already present in the workspace is not a failure — it resolves to the existing repo.

## `/repos/:repoId/pulls` — PR list

- Data: `GET /repos/:id/pulls`, `GET /repos/:id/index-state`.
- Each row shows PR identity (number, title, author, branch) and review status, which distinguishes never reviewed, reviewed, and needs re-review because the head commit moved.
- The **Indexed** badge reflects index state. Not-indexed is a normal state, not an error — reviews still work.
- Manual refresh calls `POST /repos/:id/poll`, which syncs the PR list only and must never start a review.
- An unknown `repoId` renders the repo-not-found state, not a crash.

## `/repos/:repoId/pulls/:number` — review detail

- The route is keyed by PR **number**; the id required by the PR APIs is resolved from the cached pulls list first.
- Tabs are driven by `?tab=`: overview, files changed (diff), findings and agent runs.
- Data: `GET /pulls/:id`, `GET /pulls/:id/reviews`, `GET /pulls/:id/runs`, `GET /pulls/:id/runs/active`, `GET /pulls/:id/comments`.
- Running a review: choose one agent or all enabled agents → `POST /pulls/:id/review` → run ids come back at once → live progress over SSE, status confirmed by polling.
- A run in flight must still be visible after a reload or navigation, because active runs are server-sourced.
- Every run appears in the run history with its status. A failed run shows its error text; a cancelled run is distinguishable from a failure.
- Findings are grouped per run, carry severity and category, and can be accepted or dismissed.
- The verdict banner shows the deterministic score; it can never contradict the findings listed beneath it.
- The trace drawer opens via `?trace=<runId>` and renders the persisted trace: prompt assembly, tool calls, stats, raw output, full log.
- Cancelling a run is available while it runs and works even for a run orphaned by a server restart.
- The Files changed tab defaults to Smart order — role groups (core, tests, wiring, docs, boilerplate) from `GET /pulls/:id/smart-diff`, with docs and boilerplate collapsed by default. `?order=original` shows GitHub order instead. Findings are matched to files client-side from `/pulls/:id/reviews`, on `file` + `start_line` (RIGHT side) — the server never does this association.

## `/agents` and `/agents/:id`

- List shows the built-in and user-created agents with enabled state, provider, and model.
- The editor configures name, provider, model, system prompt, review strategy, the per-agent repo-intel toggle, and the severity gate.
- Model lists come from `/agents/:id/models` or `/providers/:id/models` and degrade to empty when no key is configured — the editor must stay usable.
- Saving creates a new agent version; history is available.
- `?tab=context` (SPEC-01 / L05): attach/reorder this agent's own project-context documents (`GET`/`PUT /agents/:id/context`), from the **active repo**'s listing. Shows every linked skill's inherited documents first (including disabled skills, dimmed), then the agent's own, in the effective (run-time) order. Linking/unlinking a skill (Skills tab) invalidates this tab's data.
- The Skills Lab's skill detail pane (`/skills`) has its own "Project context to use" **section** (not a tab, `GET`/`PUT /skills/:id/context`) that any agent linking that skill inherits from. It shows a live "SERIALIZES AS" preview (`GET /skills/:id/context/preview`) of the exact `## Project context` block that skill would contribute, truncation warning included.

## `/repos/:repoId/conventions` — Conventions Extractor

- Data: `GET /repos/:id/conventions`; the scan is `POST /repos/:id/conventions/extract`.
- Every candidate is shown with the evidence it was verified against — `file:line` plus the real snippet — because that citation, not the model's confidence, is what the user is judging.
- A candidate can be accepted, un-accepted, rejected, or have its rule text and category edited in place (`PATCH /conventions/:id`). Accept and reject are both reversible; nothing here is a one-way door.
- Undecided candidates sort first, then accepted, then rejected; within a bucket, strongest evidence first.
- After a scan the page reports what it sampled, what was proposed, what survived, and why the rest did not — a thin result must be explainable, not silent.
- Re-scanning preserves accepted and rejected rows and does not re-ask about a rule the user already judged.
- **Create skill** opens the merged draft from `GET /repos/:id/conventions/skill-draft`. Name, description, enabled state and the whole markdown body are editable before saving via `POST /repos/:id/conventions/skill`, which can also attach the new skill to agents.
- An unknown `repoId` renders the repo-not-found state; a repo that has not finished cloning fails the scan with that reason rather than an empty list.

## `/repos/:repoId/context` — Project Context

- Data: `GET /repos/:id/context` (scans on a cache miss, otherwise serves the server's in-memory cache). "Rescan" forces a fresh scan via `POST /repos/:id/context/rescan`.
- Lists every `.md` document under the repo's configured roots (`specs/`, `docs/`, `insights/` by default), at any depth, sorted alphabetically, each with its root badge and "used by N agent(s) · M skill(s)" count.
- Selecting a document shows it in the right pane, **preview** (rendered Markdown) by default or **edit** (raw source) via `?mode=`; edit is READ-ONLY — there is no save button, and nothing here ever writes to the clone.
- The status line shows the document count and when the scan last ran — no chunk/index count (this is a folder scan, not a semantic index).
- Empty states are distinct and are not errors: no clone yet (`clone_status: 'not_cloned'`), clone missing from disk (`'missing'`), and clone ready but no matching documents found.
- An unknown `repoId` renders the repo-not-found state, not a crash.
- Attaching a document to an agent or skill is done from their own editors (`/agents/:id?tab=context`, or the Skills Lab's skill detail pane), not from this page — this page is discovery/preview only.

## `/settings/:section`

- `api-keys` stores provider keys and the GitHub token. Keys are write-only from the UI: the app shows whether a key is present, never its value.
- `models` selects default models per feature.
- A newly stored key takes effect for the next run without a restart.
